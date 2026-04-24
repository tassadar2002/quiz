# Fake Services for CI Testing — Design

**Date:** 2026-04-24
**Status:** Draft, pending review
**Predecessors:** Phase 4 audio (Azure TTS + Supabase Storage) shipped in commit 72065f6 / 69d216f. `USE_FAKE_AI` already exists for the LLM call.

---

## 1. Goal

Make the audio pipeline fully testable in CI without hitting Azure Speech or Supabase Storage. Tests must be:

- **Stable** — same input always produces same output
- **Repeatable** — can run thousands of times without burning quota or polluting external state
- **Assertable** — fakes expose call history so tests can check "what was invoked with what"
- **Failure-injectable** — tests can force a specific call to throw, to cover error branches in `/api/publish`, `cascadeOwners`, `regenerateOne`, `/api/generate`

Out of scope: production behavior change, browser playback in CI, latency simulation, retry logic.

---

## 2. Architecture

Two new env flags, independently controllable:

| Flag | Default | Effect |
|---|---|---|
| `USE_FAKE_TTS` | `false` | When `'true'`, `synthesize()` returns canned bytes |
| `USE_FAKE_STORAGE` | `false` | When `'true'`, `publicUrl/exists/upload/removePrefix` operate on in-memory `Map` |

Both flags off = production. Both on = full CI offline. Single flag on is supported but uncommon (mostly useful for narrow tests; e.g. `USE_FAKE_TTS` alone lets you test that real Supabase Storage works while keeping zero Azure cost).

Same dispatch pattern as the existing `USE_FAKE_AI`: each public function in `lib/tts/azure.ts` and `lib/tts/storage.ts` checks `process.env.USE_FAKE_*` at call time and delegates to a sibling fake module. Callers (`precompute.ts`, `app/api/publish/route.ts`, `lib/db/actions/_cascade.ts`, etc.) are unchanged.

---

## 3. File Layout

```
lib/tts/
  azure.ts              ← unchanged signature; top-level if-fake → azure-fake
  azure-fake.ts         ← NEW — fake synthesize(text)
  storage.ts            ← unchanged signature; if-fake → storage-fake
  storage-fake.ts       ← NEW — in-memory Map + injection hooks
  fake-control.ts       ← NEW — shared mutable state + reset() + injected error class
  precompute.ts         ← unchanged
app/
  api/
    __fake_control/
      route.ts          ← NEW — HTTP control plane (only active when a fake flag is on)
tests/
  integration/
    publish.test.ts     ← NEW — /api/publish SSE happy + failure paths
    cascade.test.ts     ← NEW — cascadeOwners with storage failure
  setup-fakes.ts        ← NEW — vitest setupFile that sets env + reset between tests
lib/tts/
  azure-fake.test.ts    ← NEW — fake synthesize behavior + injection
  storage-fake.test.ts  ← NEW — fake storage behavior + injection
  precompute.test.ts    ← NEW — runJobs progress events + partial failure
```

---

## 4. Component Detail

### 4.1 `lib/tts/fake-control.ts`

Single module-level object holding all mutable knobs and call logs. Both fakes import from here. Tests mutate fields directly; `reset()` returns to baseline.

```ts
export class FakeInjectedError extends Error {
  constructor(scope: 'tts' | 'storage', detail: string) {
    super(`fake ${scope} injected failure: ${detail}`);
    this.name = 'FakeInjectedError';
  }
}

type StorageOp = 'exists' | 'upload' | 'removePrefix' | 'publicUrl';

type CallLogEntry =
  | { kind: 'tts'; text: string }
  | { kind: 'storage'; op: StorageOp; path: string };

export const fakeControl = {
  // TTS injection
  ttsFailNextN: 0,
  ttsFailForText: new Set<string>(),

  // Storage injection
  storageFailNextN: 0,
  storageFailForPath: new Set<string>(),

  // Observability for assertions
  calls: [] as CallLogEntry[],

  reset() {
    this.ttsFailNextN = 0;
    this.ttsFailForText.clear();
    this.storageFailNextN = 0;
    this.storageFailForPath.clear();
    this.calls.length = 0;
    // Note: this does NOT clear the storage-fake's in-memory Map. That lives
    // in storage-fake.ts to avoid a circular import. Tests should call both
    // fakeControl.reset() and fakeStorageReset(); the setup file does this
    // automatically and the HTTP control plane's `{reset:true}` calls both.
  },
};
```

Helpers:
- `fakeControl.calls.filter(c => c.kind === 'tts')` → all TTS calls
- `fakeControl.calls.filter(c => c.kind === 'storage' && c.op === 'upload')` → all uploads

### 4.2 `lib/tts/azure-fake.ts`

```ts
export async function fakeSynthesize(text: string): Promise<Buffer> {
  fakeControl.calls.push({ kind: 'tts', text });

  if (fakeControl.ttsFailForText.has(text)) {
    throw new FakeInjectedError('tts', `text="${text.slice(0, 40)}"`);
  }
  if (fakeControl.ttsFailNextN > 0) {
    fakeControl.ttsFailNextN -= 1;
    throw new FakeInjectedError('tts', `failNextN consumed`);
  }
  // Deterministic small payload, easy to assert in storage tests
  const tag = createHash('sha1').update(text).digest('hex').slice(0, 8);
  return Buffer.from(`FAKE_AUDIO:${tag}`);
}
```

### 4.3 `lib/tts/storage-fake.ts`

```ts
const store = new Map<string, Buffer>();

export function fakeStorageReset() { store.clear(); }

function checkInjection(op: StorageOp, path: string) {
  fakeControl.calls.push({ kind: 'storage', op, path });
  if (fakeControl.storageFailForPath.has(path)) {
    throw new FakeInjectedError('storage', `${op} ${path}`);
  }
  if (fakeControl.storageFailNextN > 0) {
    fakeControl.storageFailNextN -= 1;
    throw new FakeInjectedError('storage', `failNextN consumed (${op} ${path})`);
  }
}

export function fakePublicUrl(path: string): string {
  checkInjection('publicUrl', path);
  return `fake://${path}`;
}

export async function fakeExists(path: string): Promise<boolean> {
  checkInjection('exists', path);
  return store.has(path);
}

export async function fakeUpload(path: string, buf: Buffer): Promise<void> {
  checkInjection('upload', path);
  store.set(path, buf);
}

export async function fakeRemovePrefix(prefix: string): Promise<void> {
  checkInjection('removePrefix', prefix);
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}/`)) store.delete(key);
  }
}

// Test helpers (re-exported from fake-control for ergonomics)
export function fakeStorageSnapshot(): Map<string, number> {
  // Returns path → byte length, useful for size assertions without leaking buffers
  const out = new Map<string, number>();
  for (const [k, v] of store) out.set(k, v.length);
  return out;
}
```

### 4.4 Dispatch in real modules

Minimal shim at top of each function. Example for `azure.ts`:

```ts
export async function synthesize(text: string): Promise<Buffer> {
  if (process.env.USE_FAKE_TTS === 'true') {
    const { fakeSynthesize } = await import('./azure-fake');
    return fakeSynthesize(text);
  }
  // ...existing real impl
}
```

Lazy `await import` avoids bundling fake code into production builds. (Alternative: top-level static import + tree-shaking. Lazy import is simpler and we don't ship to client anyway.)

### 4.5 `app/api/__fake_control/route.ts`

```ts
import { NextResponse, type NextRequest } from 'next/server';

function isFakeMode() {
  return process.env.USE_FAKE_TTS === 'true' || process.env.USE_FAKE_STORAGE === 'true';
}

export async function GET() {
  if (!isFakeMode()) return new NextResponse(null, { status: 404 });
  const { fakeControl } = await import('@/lib/tts/fake-control');
  return NextResponse.json({
    ttsFailNextN: fakeControl.ttsFailNextN,
    ttsFailForText: [...fakeControl.ttsFailForText],
    storageFailNextN: fakeControl.storageFailNextN,
    storageFailForPath: [...fakeControl.storageFailForPath],
    callCount: fakeControl.calls.length,
    calls: fakeControl.calls.slice(-50), // last 50, avoid huge response
  });
}

export async function POST(req: NextRequest) {
  if (!isFakeMode()) return new NextResponse(null, { status: 404 });
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const body = await req.json().catch(() => ({}));

  if (body.reset === true) {
    fakeControl.reset();
    const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
    fakeStorageReset();
    return NextResponse.json({ ok: true });
  }
  if (typeof body.ttsFailNextN === 'number') fakeControl.ttsFailNextN = body.ttsFailNextN;
  if (Array.isArray(body.ttsFailForText)) fakeControl.ttsFailForText = new Set(body.ttsFailForText);
  if (typeof body.storageFailNextN === 'number') fakeControl.storageFailNextN = body.storageFailNextN;
  if (Array.isArray(body.storageFailForPath)) fakeControl.storageFailForPath = new Set(body.storageFailForPath);
  return NextResponse.json({ ok: true });
}
```

Security: `isFakeMode()` is evaluated per request from env. In production env, both flags are `false` → route returns 404. In CI / local fake mode, accessible without auth. Do NOT add to `PROTECTED_API` in `proxy.ts` — tests should be able to hit it without logging in.

### 4.6 Vitest setup file

`tests/setup-fakes.ts`:

```ts
import { beforeEach, afterAll } from 'vitest';

// Set env BEFORE any module that reads process.env.USE_FAKE_* is imported.
// vitest.config.ts → test.setupFiles ensures this runs first.
process.env.USE_FAKE_TTS = 'true';
process.env.USE_FAKE_STORAGE = 'true';

// Reset shared state between tests so they can't leak.
beforeEach(async () => {
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
  fakeControl.reset();
  fakeStorageReset();
});
```

Add to `vitest.config.ts`:
```ts
test: { setupFiles: ['./tests/setup-fakes.ts'], ... }
```

---

## 5. Test Patterns

### 5.1 Vitest — direct import

```ts
import { fakeControl } from '@/lib/tts/fake-control';
import { runJobs, jobsForQuestions } from '@/lib/tts/precompute';

test('runJobs reports failed count when TTS fails partway', async () => {
  const qs = [{ id: 'q1', stem: 'A', options: ['x', 'y', 'z'] }];
  const jobs = jobsForQuestions(qs); // 4 jobs
  fakeControl.ttsFailForText.add('y');
  const final = await runJobs(jobs, () => {});
  expect(final.failed).toBe(1);
  expect(final.generated).toBe(3);
  expect(final.lastError).toMatch(/text="y"/);
});

test('/api/publish does not flip status when audio gen fails', async () => {
  fakeControl.ttsFailNextN = 999;
  // ... POST to route, parse SSE, assert error event + DB status === 'draft'
});
```

### 5.2 Playwright — HTTP control

```ts
test('publish error path shows red message', async ({ page, request }) => {
  await request.post('/api/__fake_control', { data: { reset: true } });
  await request.post('/api/__fake_control', { data: { storageFailNextN: 1 } });

  await loginAsAdmin(page);
  await page.goto('/admin/titles/<draft-title-id>/review');
  await page.click('text=发布这组题');

  await expect(page.locator('.text-danger')).toContainText('生成失败');

  // Optional: verify only one upload was attempted
  const state = await request.get('/api/__fake_control').then(r => r.json());
  expect(state.calls.filter((c: any) => c.op === 'upload').length).toBe(1);
});
```

---

## 6. Specific Test Scenarios Enabled

| Scenario | Where | What it catches |
|---|---|---|
| `runJobs` reports `failed > 0` | `precompute.test.ts` | Concurrency / counter bugs |
| `/api/publish` does not flip status when any audio fails | `tests/integration/publish.test.ts` | Atomicity bug in route |
| `/api/publish` cache-hit path: republish has `cached === total` | publish.test.ts | Cache-skip logic in `runJobs` |
| `cascadeOwners` deletes DB rows even when storage `removePrefix` fails | `cascade.test.ts` | The `Promise.all(...catch)` swallow |
| `regenerateOne` returns ok even when storage cleanup fails | regen test | Audio cleanup is best-effort |
| `/api/generate` continues past orphan-cleanup failure | generate test | Same best-effort guarantee |
| `/api/generate` returns 409 when owner is published | generate test | Block-on-published rule |
| Per-question `regenerateOne` returns error message when published | regen test | Same rule |

---

## 7. What This Does NOT Do

- Does not replace the real LLM call (`USE_FAKE_AI` already handles that)
- Does not fake Postgres — tests still need a real DB (the existing local Postgres)
- Does not produce browser-playable audio URLs (the kid-browser path is e2e-only and would need real services or a separate fake-audio file route — defer)
- Does not simulate latency or partial network failure — `ttsLatencyMs` was considered and dropped as YAGNI
- Does not retry — current real code doesn't retry either; fake matches behavior

---

## 8. Open Questions / Risks

- **Module state across vitest test files**: vitest by default isolates module graphs per file. If a test file forgets `beforeEach(reset)`, state from the same file's earlier tests can leak. The setup file makes this automatic for all files that opt into it.
- **`await import` cost in production**: lazy import has a tiny startup cost on the first call after deploy. Acceptable; happens once per warm container.
- **HTTP control endpoint enabled in production**: guarded by env-based 404. Even if a flag were accidentally set in production, the route only exposes call logs and toggles for fake services that aren't reachable through the real code paths anyway. Risk is bounded.

---

## 9. Decision Record

| Decision | Choice | Rejected |
|---|---|---|
| Number of flags | 2 (TTS + Storage independent) | 1 combined `USE_FAKE_AUDIO` |
| Fake URL format | `fake://<path>` sentinel | `data:audio/mpeg;base64,...`; HTTP route serving bytes |
| Failure injection scope | vitest (direct) + playwright (HTTP) | vitest only |
| Field set | `failNextN`, `failForText/Path`, `calls` | `latencyMs` (YAGNI) |
| Control endpoint shape | One unified `/api/__fake_control` GET+POST | Multiple per-knob routes |
| Vitest env loading | `setupFiles` in `vitest.config.ts` | `.env.test` |
| Dispatch style | `await import` lazy at call site | Top-level static import |
