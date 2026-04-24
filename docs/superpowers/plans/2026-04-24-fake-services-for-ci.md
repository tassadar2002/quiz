# Fake Services for CI Testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-memory fakes for Azure TTS and Supabase Storage with failure injection, so the audio pipeline (publish, regen, cascade-delete) can be tested in CI without external services.

**Architecture:** Two independent env flags (`USE_FAKE_TTS`, `USE_FAKE_STORAGE`) make the existing `synthesize()` / `publicUrl/exists/upload/removePrefix` functions delegate to sibling fake modules. A shared `fake-control.ts` holds mutable state (failure counters, allow-lists, call log) that vitest tests mutate directly and playwright tests mutate over HTTP via a new `/api/__fake_control` route. Storage fake uses an in-memory `Map`; TTS fake returns a deterministic small `Buffer`. URLs returned by fake storage use a `fake://` sentinel scheme — no browser playback in CI.

**Tech Stack:** TypeScript, Next.js 16, vitest 4, drizzle-orm, postgres-js. Existing patterns: `USE_FAKE_AI` flag (already in `lib/ai/generate.ts`), `TEST_BYPASS_AUTH` env var (already honored by `lib/auth/guard.ts:requireAdmin`).

**Reference spec:** `docs/superpowers/specs/2026-04-24-fake-services-for-ci-design.md`

**Prereq for executor:** Tests run against the dev database `quiz` (per user choice). Integration test fixtures use `crypto.randomUUID()` for all owner ids so they don't collide with dev data, and each test's `afterEach` calls `cleanup()` to delete its rows. No separate `quiz_test` DB needed.

---

## File Map

**Create:**
- `lib/tts/fake-control.ts` — mutable state container, `FakeInjectedError`, `reset()`
- `lib/tts/fake-control.test.ts`
- `lib/tts/azure-fake.ts` — fake `synthesize()`
- `lib/tts/azure-fake.test.ts`
- `lib/tts/storage-fake.ts` — in-memory Map + fake `publicUrl/exists/upload/removePrefix` + own `fakeStorageReset()` and `fakeStorageSnapshot()`
- `lib/tts/storage-fake.test.ts`
- `lib/tts/azure.test.ts` — tests the dispatch in `azure.ts`
- `lib/tts/storage.test.ts` — tests the dispatch in `storage.ts`
- `lib/tts/precompute.test.ts` — tests `runJobs` end-to-end via fakes
- `tests/setup-fakes.ts` — vitest setupFile that sets env + resets fakes between tests
- `tests/integration/_fixtures.ts` — DB fixture helpers shared by integration tests
- `tests/integration/fake-control-route.test.ts` — tests `/api/__fake_control`
- `tests/integration/publish.test.ts` — tests `/api/publish` SSE flow + failure injection
- `tests/integration/cascade.test.ts` — tests `cascadeOwners` with storage failure
- `tests/integration/regenerate-one.test.ts` — tests block-on-published + audio invalidation
- `tests/integration/generate-block.test.ts` — tests `/api/generate` block + orphan cleanup
- `app/api/__fake_control/route.ts` — HTTP control plane for e2e

**Modify:**
- `lib/tts/azure.ts` — add `USE_FAKE_TTS` dispatch at top of `synthesize()`
- `lib/tts/storage.ts` — add `USE_FAKE_STORAGE` dispatch at top of all four functions
- `vitest.config.ts` — add env vars + `setupFiles`

---

## Task 1: fake-control.ts (state container + error class)

**Files:**
- Create: `lib/tts/fake-control.ts`
- Test: `lib/tts/fake-control.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/tts/fake-control.test.ts
import { describe, it, expect } from 'vitest';
import { fakeControl, FakeInjectedError } from './fake-control';

describe('fakeControl', () => {
  it('starts with all knobs at baseline', () => {
    fakeControl.reset();
    expect(fakeControl.ttsFailNextN).toBe(0);
    expect(fakeControl.ttsFailForText.size).toBe(0);
    expect(fakeControl.storageFailNextN).toBe(0);
    expect(fakeControl.storageFailForPath.size).toBe(0);
    expect(fakeControl.calls).toEqual([]);
  });

  it('reset() clears every field after mutation', () => {
    fakeControl.ttsFailNextN = 5;
    fakeControl.ttsFailForText.add('boom');
    fakeControl.storageFailNextN = 3;
    fakeControl.storageFailForPath.add('a/b.mp3');
    fakeControl.calls.push({ kind: 'tts', text: 'logged' });
    fakeControl.reset();
    expect(fakeControl.ttsFailNextN).toBe(0);
    expect(fakeControl.ttsFailForText.size).toBe(0);
    expect(fakeControl.storageFailNextN).toBe(0);
    expect(fakeControl.storageFailForPath.size).toBe(0);
    expect(fakeControl.calls).toEqual([]);
  });
});

describe('FakeInjectedError', () => {
  it('preserves scope and detail in message and exposes name', () => {
    const e = new FakeInjectedError('tts', 'failNextN consumed');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('FakeInjectedError');
    expect(e.message).toBe('fake tts injected failure: failNextN consumed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/tts/fake-control.test.ts`
Expected: FAIL — module `./fake-control` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tts/fake-control.ts
export class FakeInjectedError extends Error {
  constructor(scope: 'tts' | 'storage', detail: string) {
    super(`fake ${scope} injected failure: ${detail}`);
    this.name = 'FakeInjectedError';
  }
}

export type StorageOp = 'exists' | 'upload' | 'removePrefix' | 'publicUrl';

export type CallLogEntry =
  | { kind: 'tts'; text: string }
  | { kind: 'storage'; op: StorageOp; path: string };

export const fakeControl = {
  ttsFailNextN: 0 as number,
  ttsFailForText: new Set<string>(),
  storageFailNextN: 0 as number,
  storageFailForPath: new Set<string>(),
  calls: [] as CallLogEntry[],

  reset() {
    this.ttsFailNextN = 0;
    this.ttsFailForText.clear();
    this.storageFailNextN = 0;
    this.storageFailForPath.clear();
    this.calls.length = 0;
    // Storage fake's in-memory Map is reset separately by fakeStorageReset()
    // (lives in storage-fake.ts to avoid circular import). The vitest setup
    // file calls both.
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/tts/fake-control.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/fake-control.ts lib/tts/fake-control.test.ts
git commit -m "feat(test): fake-control state container + FakeInjectedError"
```

---

## Task 2: azure-fake.ts (fake synthesize)

**Files:**
- Create: `lib/tts/azure-fake.ts`
- Test: `lib/tts/azure-fake.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/tts/azure-fake.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeSynthesize } from './azure-fake';
import { fakeControl, FakeInjectedError } from './fake-control';

beforeEach(() => fakeControl.reset());

describe('fakeSynthesize', () => {
  it('returns deterministic Buffer for the same text', async () => {
    const a = await fakeSynthesize('hello world');
    const b = await fakeSynthesize('hello world');
    expect(Buffer.isBuffer(a)).toBe(true);
    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toMatch(/^FAKE_AUDIO:[a-f0-9]{8}$/);
  });

  it('returns different Buffer for different text', async () => {
    const a = await fakeSynthesize('one');
    const b = await fakeSynthesize('two');
    expect(a.toString()).not.toBe(b.toString());
  });

  it('logs each call into fakeControl.calls', async () => {
    await fakeSynthesize('one');
    await fakeSynthesize('two');
    expect(fakeControl.calls).toEqual([
      { kind: 'tts', text: 'one' },
      { kind: 'tts', text: 'two' },
    ]);
  });

  it('throws FakeInjectedError when ttsFailNextN > 0 and decrements counter', async () => {
    fakeControl.ttsFailNextN = 2;
    await expect(fakeSynthesize('a')).rejects.toThrow(FakeInjectedError);
    await expect(fakeSynthesize('b')).rejects.toThrow(FakeInjectedError);
    expect(fakeControl.ttsFailNextN).toBe(0);
    // Next call after counter exhausted should succeed.
    await expect(fakeSynthesize('c')).resolves.toBeInstanceOf(Buffer);
  });

  it('throws FakeInjectedError when text is in ttsFailForText', async () => {
    fakeControl.ttsFailForText.add('boom');
    await expect(fakeSynthesize('boom')).rejects.toThrow(FakeInjectedError);
    await expect(fakeSynthesize('safe')).resolves.toBeInstanceOf(Buffer);
  });

  it('still logs the call when failure is injected', async () => {
    fakeControl.ttsFailForText.add('logged');
    await expect(fakeSynthesize('logged')).rejects.toThrow();
    expect(fakeControl.calls).toEqual([{ kind: 'tts', text: 'logged' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/tts/azure-fake.test.ts`
Expected: FAIL — module `./azure-fake` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tts/azure-fake.ts
import { createHash } from 'node:crypto';
import { fakeControl, FakeInjectedError } from './fake-control';

export async function fakeSynthesize(text: string): Promise<Buffer> {
  fakeControl.calls.push({ kind: 'tts', text });

  if (fakeControl.ttsFailForText.has(text)) {
    throw new FakeInjectedError('tts', `text="${text.slice(0, 40)}"`);
  }
  if (fakeControl.ttsFailNextN > 0) {
    fakeControl.ttsFailNextN -= 1;
    throw new FakeInjectedError('tts', 'failNextN consumed');
  }

  const tag = createHash('sha1').update(text).digest('hex').slice(0, 8);
  return Buffer.from(`FAKE_AUDIO:${tag}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/tts/azure-fake.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/azure-fake.ts lib/tts/azure-fake.test.ts
git commit -m "feat(test): fake azure synthesize with deterministic output + injection"
```

---

## Task 3: storage-fake.ts (in-memory Map + fake ops)

**Files:**
- Create: `lib/tts/storage-fake.ts`
- Test: `lib/tts/storage-fake.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/tts/storage-fake.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  fakePublicUrl,
  fakeExists,
  fakeUpload,
  fakeRemovePrefix,
  fakeStorageReset,
  fakeStorageSnapshot,
} from './storage-fake';
import { fakeControl, FakeInjectedError } from './fake-control';

beforeEach(() => {
  fakeControl.reset();
  fakeStorageReset();
});

describe('fake storage — happy path', () => {
  it('publicUrl returns fake:// scheme', () => {
    expect(fakePublicUrl('q1/stem.mp3')).toBe('fake://q1/stem.mp3');
  });

  it('upload then exists returns true; non-existent path returns false', async () => {
    await fakeUpload('q1/stem.mp3', Buffer.from('x'));
    expect(await fakeExists('q1/stem.mp3')).toBe(true);
    expect(await fakeExists('q1/option0.mp3')).toBe(false);
  });

  it('removePrefix removes all paths with the prefix and only those', async () => {
    await fakeUpload('q1/stem.mp3', Buffer.from('x'));
    await fakeUpload('q1/option0.mp3', Buffer.from('y'));
    await fakeUpload('q2/stem.mp3', Buffer.from('z'));
    await fakeRemovePrefix('q1');
    expect(await fakeExists('q1/stem.mp3')).toBe(false);
    expect(await fakeExists('q1/option0.mp3')).toBe(false);
    expect(await fakeExists('q2/stem.mp3')).toBe(true);
  });

  it('snapshot returns path → byte length', async () => {
    await fakeUpload('a.mp3', Buffer.from('hello'));
    const snap = fakeStorageSnapshot();
    expect(snap.get('a.mp3')).toBe(5);
  });

  it('logs each storage op into fakeControl.calls', async () => {
    await fakeUpload('q1/stem.mp3', Buffer.from('x'));
    await fakeExists('q1/stem.mp3');
    fakePublicUrl('q1/stem.mp3');
    await fakeRemovePrefix('q1');
    expect(fakeControl.calls).toEqual([
      { kind: 'storage', op: 'upload', path: 'q1/stem.mp3' },
      { kind: 'storage', op: 'exists', path: 'q1/stem.mp3' },
      { kind: 'storage', op: 'publicUrl', path: 'q1/stem.mp3' },
      { kind: 'storage', op: 'removePrefix', path: 'q1' },
    ]);
  });
});

describe('fake storage — failure injection', () => {
  it('storageFailNextN throws on next op then resumes', async () => {
    fakeControl.storageFailNextN = 1;
    await expect(fakeUpload('a.mp3', Buffer.from('x'))).rejects.toThrow(FakeInjectedError);
    expect(fakeControl.storageFailNextN).toBe(0);
    await fakeUpload('b.mp3', Buffer.from('y'));
    expect(await fakeExists('b.mp3')).toBe(true);
  });

  it('storageFailForPath throws only on matching path', async () => {
    fakeControl.storageFailForPath.add('forbidden.mp3');
    await expect(fakeUpload('forbidden.mp3', Buffer.from('x'))).rejects.toThrow(FakeInjectedError);
    await fakeUpload('allowed.mp3', Buffer.from('y'));
    expect(await fakeExists('allowed.mp3')).toBe(true);
  });

  it('fakeStorageReset clears the in-memory Map', async () => {
    await fakeUpload('a.mp3', Buffer.from('x'));
    fakeStorageReset();
    expect(await fakeExists('a.mp3')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/tts/storage-fake.test.ts`
Expected: FAIL — module `./storage-fake` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tts/storage-fake.ts
import { fakeControl, FakeInjectedError, type StorageOp } from './fake-control';

const store = new Map<string, Buffer>();

export function fakeStorageReset(): void {
  store.clear();
}

export function fakeStorageSnapshot(): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of store) out.set(k, v.length);
  return out;
}

function checkInjection(op: StorageOp, path: string): void {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/tts/storage-fake.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/storage-fake.ts lib/tts/storage-fake.test.ts
git commit -m "feat(test): fake storage with in-memory Map + injection hooks"
```

---

## Task 4: vitest setup file + config

**Files:**
- Create: `tests/setup-fakes.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Create the setup file**

```ts
// tests/setup-fakes.ts
import { beforeEach } from 'vitest';

// Set env BEFORE any module that reads process.env.USE_FAKE_* is imported.
// vitest.config.ts → test.setupFiles ensures this runs before user test files.
process.env.USE_FAKE_TTS = 'true';
process.env.USE_FAKE_STORAGE = 'true';

beforeEach(async () => {
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
  fakeControl.reset();
  fakeStorageReset();
});
```

- [ ] **Step 2: Modify vitest.config.ts**

Add `setupFiles` to the `test` block. The diff:

```ts
// vitest.config.ts (full file after edit)
import { defineConfig } from 'vitest/config';
import path from 'node:path';

const withDefault = (key: string, fallback: string) => process.env[key] ?? fallback;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**'],
    setupFiles: ['./tests/setup-fakes.ts'],
    env: {
      SESSION_SECRET: withDefault('SESSION_SECRET', 'x'.repeat(32)),
      ADMIN_PASSWORD: withDefault('ADMIN_PASSWORD', 'test-password'),
      DATABASE_URL: withDefault(
        'DATABASE_URL',
        'postgresql://quiz:quiz@localhost:5432/quiz',
      ),
      LLM_BASE_URL: withDefault('LLM_BASE_URL', 'https://example.invalid'),
      LLM_API_KEY: withDefault('LLM_API_KEY', 'test'),
      LLM_MODEL: withDefault('LLM_MODEL', 'fake'),
      USE_FAKE_AI: withDefault('USE_FAKE_AI', 'true'),
      USE_FAKE_TTS: withDefault('USE_FAKE_TTS', 'true'),
      USE_FAKE_STORAGE: withDefault('USE_FAKE_STORAGE', 'true'),
      TEST_BYPASS_AUTH: withDefault('TEST_BYPASS_AUTH', 'true'),
    },
  },
});
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `pnpm test`
Expected: All previous tests (fake-control, azure-fake, storage-fake, plus any pre-existing) pass. Setup file runs without error.

- [ ] **Step 4: Commit**

```bash
git add tests/setup-fakes.ts vitest.config.ts
git commit -m "test: vitest setupFile resets fakes between tests"
```

---

## Task 5: Wire fake dispatch into azure.ts

**Files:**
- Create: `lib/tts/azure.test.ts`
- Modify: `lib/tts/azure.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/tts/azure.test.ts
import { describe, it, expect } from 'vitest';
import { synthesize } from './azure';
import { fakeControl, FakeInjectedError } from './fake-control';

// USE_FAKE_TTS=true is set globally by tests/setup-fakes.ts, so synthesize()
// should delegate to fakeSynthesize. We verify via the call log + injection.
describe('synthesize() dispatch', () => {
  it('delegates to fake when USE_FAKE_TTS=true (logs into fakeControl.calls)', async () => {
    expect(process.env.USE_FAKE_TTS).toBe('true');
    const buf = await synthesize('dispatched');
    expect(buf.toString()).toMatch(/^FAKE_AUDIO:/);
    expect(fakeControl.calls).toContainEqual({ kind: 'tts', text: 'dispatched' });
  });

  it('failure injection on the fake propagates through the dispatcher', async () => {
    fakeControl.ttsFailForText.add('boom');
    await expect(synthesize('boom')).rejects.toThrow(FakeInjectedError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/tts/azure.test.ts`
Expected: FAIL — `synthesize` will try to call real Azure (env keys missing) and throw `AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured`.

- [ ] **Step 3: Modify lib/tts/azure.ts**

Add the dispatch at the top of `synthesize()`:

```ts
// lib/tts/azure.ts (full file after edit)
const VOICE = 'en-US-JennyNeural';
const RATE = '-10%';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text: string): string {
  return `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='${VOICE}'><prosody rate='${RATE}'>${escapeXml(text)}</prosody></voice></speak>`;
}

export async function synthesize(text: string): Promise<Buffer> {
  if (process.env.USE_FAKE_TTS === 'true') {
    const { fakeSynthesize } = await import('./azure-fake');
    return fakeSynthesize(text);
  }
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured');
  }
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'quiz-tts',
    },
    body: buildSsml(text),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Azure TTS failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/tts/azure.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/azure.ts lib/tts/azure.test.ts
git commit -m "feat: USE_FAKE_TTS dispatch in synthesize()"
```

---

## Task 6: Wire fake dispatch into storage.ts

**Files:**
- Create: `lib/tts/storage.test.ts`
- Modify: `lib/tts/storage.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/tts/storage.test.ts
import { describe, it, expect } from 'vitest';
import { publicUrl, exists, upload, removePrefix } from './storage';
import { fakeControl, FakeInjectedError } from './fake-control';

describe('storage dispatch (USE_FAKE_STORAGE=true via setup file)', () => {
  it('publicUrl returns fake:// URL', () => {
    expect(process.env.USE_FAKE_STORAGE).toBe('true');
    expect(publicUrl('a/b.mp3')).toBe('fake://a/b.mp3');
  });

  it('upload + exists round-trip works against fake', async () => {
    await upload('q1/stem.mp3', Buffer.from('hi'));
    expect(await exists('q1/stem.mp3')).toBe(true);
  });

  it('removePrefix removes via fake', async () => {
    await upload('q2/stem.mp3', Buffer.from('a'));
    await upload('q2/option0.mp3', Buffer.from('b'));
    await removePrefix('q2');
    expect(await exists('q2/stem.mp3')).toBe(false);
    expect(await exists('q2/option0.mp3')).toBe(false);
  });

  it('failure injection propagates from fake through dispatcher', async () => {
    fakeControl.storageFailNextN = 1;
    await expect(upload('x.mp3', Buffer.from('z'))).rejects.toThrow(FakeInjectedError);
  });

  it('all four ops appear in the fake call log', async () => {
    publicUrl('a.mp3');
    await exists('a.mp3');
    await upload('a.mp3', Buffer.from('x'));
    await removePrefix('a');
    const ops = fakeControl.calls
      .filter((c) => c.kind === 'storage')
      .map((c) => c.op);
    expect(ops).toEqual(['publicUrl', 'exists', 'upload', 'removePrefix']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/tts/storage.test.ts`
Expected: FAIL — `publicUrl` will currently try to construct a real Supabase client and either return a non-`fake://` URL or throw because creds are not set.

- [ ] **Step 3: Modify lib/tts/storage.ts**

Add a dispatch at the top of each public function. Full file after edit:

```ts
// lib/tts/storage.ts
import { createClient } from '@supabase/supabase-js';
import {
  fakePublicUrl,
  fakeExists,
  fakeUpload,
  fakeRemovePrefix,
} from './storage-fake';

const BUCKET = 'audio';

let _client: ReturnType<typeof createClient> | null = null;
let _bucketEnsured = false;

function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '');
  return `https://${trimmed}.supabase.co`;
}

function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  _client = createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: { persistSession: false },
  });
  return _client;
}

async function ensureBucket() {
  if (_bucketEnsured) return;
  const sb = client();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Failed to create bucket "${BUCKET}": ${error.message}`);
    }
  }
  _bucketEnsured = true;
}

function useFake() {
  return process.env.USE_FAKE_STORAGE === 'true';
}

export function publicUrl(path: string): string {
  if (useFake()) return fakePublicUrl(path);
  return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function exists(path: string): Promise<boolean> {
  if (useFake()) return fakeExists(path);
  await ensureBucket();
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await client().storage.from(BUCKET).list(dir, {
    limit: 100,
    search: name,
  });
  if (error) throw new Error(`Storage list failed: ${error.message}`);
  return !!data?.some((f) => f.name === name);
}

export async function upload(path: string, buf: Buffer): Promise<void> {
  if (useFake()) return fakeUpload(path, buf);
  await ensureBucket();
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, buf, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function removePrefix(prefix: string): Promise<void> {
  if (useFake()) return fakeRemovePrefix(prefix);
  await ensureBucket();
  const { data, error: listErr } = await client()
    .storage.from(BUCKET)
    .list(prefix, { limit: 100 });
  if (listErr) throw new Error(`Storage list failed: ${listErr.message}`);
  if (!data?.length) return;
  const paths = data.map((f) => `${prefix}/${f.name}`);
  const { error } = await client().storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Storage remove failed: ${error.message}`);
}
```

Note: static imports of the fake functions match the existing `USE_FAKE_AI` convention (`lib/ai/generate.ts:14`). The fake module is server-only and tiny, so bundling cost is negligible. This also keeps `publicUrl` synchronous without a CommonJS `require` workaround.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/tts/storage.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Run full typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/tts/storage.ts lib/tts/storage.test.ts
git commit -m "feat: USE_FAKE_STORAGE dispatch in storage.ts"
```

---

## Task 7: precompute.test.ts (runJobs end-to-end via fakes)

**Files:**
- Create: `lib/tts/precompute.test.ts`

This is a pure fake-driven test of `runJobs` — no DB, no network. Confirms the new fake plumbing actually feeds `precompute.ts` correctly.

- [ ] **Step 1: Write the failing test**

```ts
// lib/tts/precompute.test.ts
import { describe, it, expect } from 'vitest';
import {
  jobsForQuestions,
  runJobs,
  type AudioQuestion,
  type Progress,
} from './precompute';
import { fakeControl } from './fake-control';

const Q: AudioQuestion = {
  id: 'q-uuid-1',
  stem: 'What is the meaning of "fox"?',
  options: ['cat', 'dog', 'fox'],
};

describe('jobsForQuestions', () => {
  it('produces 4 jobs per question (1 stem + 3 options)', () => {
    const jobs = jobsForQuestions([Q]);
    expect(jobs).toHaveLength(4);
    expect(jobs.map((j) => j.field)).toEqual([
      'stem',
      'option0',
      'option1',
      'option2',
    ]);
  });
});

describe('runJobs', () => {
  it('first run generates all; second run all cached', async () => {
    const jobs = jobsForQuestions([Q]);
    const first = await runJobs(jobs, () => {});
    expect(first.total).toBe(4);
    expect(first.generated).toBe(4);
    expect(first.cached).toBe(0);
    expect(first.failed).toBe(0);

    const second = await runJobs(jobs, () => {});
    expect(second.cached).toBe(4);
    expect(second.generated).toBe(0);
    expect(second.failed).toBe(0);
  });

  it('reports failed without aborting other jobs', async () => {
    fakeControl.ttsFailForText.add('cat');
    const jobs = jobsForQuestions([Q]);
    const final = await runJobs(jobs, () => {});
    expect(final.total).toBe(4);
    expect(final.failed).toBe(1);
    expect(final.generated).toBe(3);
    expect(final.lastError).toMatch(/text="cat"/);
  });

  it('emits monotonic progress callbacks', async () => {
    const jobs = jobsForQuestions([Q]);
    const seen: Progress[] = [];
    await runJobs(jobs, (p) => seen.push({ ...p }));
    expect(seen.length).toBe(4);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.done).toBeGreaterThanOrEqual(seen[i - 1]!.done);
    }
    expect(seen[seen.length - 1]!.done).toBe(4);
  });

  it('force=true bypasses the cache', async () => {
    const jobs = jobsForQuestions([Q]);
    await runJobs(jobs, () => {});
    fakeControl.calls.length = 0;
    const final = await runJobs(jobs, () => {}, { force: true });
    expect(final.generated).toBe(4);
    expect(final.cached).toBe(0);
    const ttsCalls = fakeControl.calls.filter((c) => c.kind === 'tts').length;
    expect(ttsCalls).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test lib/tts/precompute.test.ts`
Expected: 5 passing. (No new implementation; precompute.ts already exists and now runs against fakes via the dispatcher.)

- [ ] **Step 3: Commit**

```bash
git add lib/tts/precompute.test.ts
git commit -m "test: precompute runJobs against fakes (cache, force, partial failure)"
```

---

## Task 8: /api/__fake_control HTTP route + integration test

**Files:**
- Create: `app/api/__fake_control/route.ts`
- Create: `tests/integration/fake-control-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/fake-control-route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/__fake_control/route';
import { fakeControl } from '@/lib/tts/fake-control';
import { fakeStorageReset, fakeUpload, fakeExists } from '@/lib/tts/storage-fake';

beforeEach(() => {
  fakeControl.reset();
  fakeStorageReset();
});

function jsonReq(body: unknown): Request {
  return new Request('http://test/api/__fake_control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/__fake_control', () => {
  it('GET returns current fake state', async () => {
    fakeControl.ttsFailNextN = 3;
    fakeControl.ttsFailForText.add('boom');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ttsFailNextN).toBe(3);
    expect(body.ttsFailForText).toEqual(['boom']);
    expect(body.callCount).toBe(0);
  });

  it('POST sets ttsFailNextN', async () => {
    const res = await POST(jsonReq({ ttsFailNextN: 5 }));
    expect(res.status).toBe(200);
    expect(fakeControl.ttsFailNextN).toBe(5);
  });

  it('POST sets storageFailForPath as a Set from array', async () => {
    await POST(jsonReq({ storageFailForPath: ['a/b.mp3', 'c.mp3'] }));
    expect(fakeControl.storageFailForPath.has('a/b.mp3')).toBe(true);
    expect(fakeControl.storageFailForPath.has('c.mp3')).toBe(true);
  });

  it('POST {reset:true} clears state AND storage Map', async () => {
    fakeControl.ttsFailNextN = 9;
    await fakeUpload('keep-me.mp3', Buffer.from('x'));
    expect(await fakeExists('keep-me.mp3')).toBe(true);
    const res = await POST(jsonReq({ reset: true }));
    expect(res.status).toBe(200);
    expect(fakeControl.ttsFailNextN).toBe(0);
    expect(await fakeExists('keep-me.mp3')).toBe(false);
  });

  it('returns 404 when neither fake flag is on', async () => {
    const prevTts = process.env.USE_FAKE_TTS;
    const prevStorage = process.env.USE_FAKE_STORAGE;
    process.env.USE_FAKE_TTS = 'false';
    process.env.USE_FAKE_STORAGE = 'false';
    try {
      const res = await GET();
      expect(res.status).toBe(404);
    } finally {
      process.env.USE_FAKE_TTS = prevTts;
      process.env.USE_FAKE_STORAGE = prevStorage;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/fake-control-route.test.ts`
Expected: FAIL — module `@/app/api/__fake_control/route` not found.

- [ ] **Step 3: Write the route**

```ts
// app/api/__fake_control/route.ts
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

function isFakeMode(): boolean {
  return (
    process.env.USE_FAKE_TTS === 'true' ||
    process.env.USE_FAKE_STORAGE === 'true'
  );
}

export async function GET(): Promise<Response> {
  if (!isFakeMode()) return new NextResponse(null, { status: 404 });
  const { fakeControl } = await import('@/lib/tts/fake-control');
  return NextResponse.json({
    ttsFailNextN: fakeControl.ttsFailNextN,
    ttsFailForText: [...fakeControl.ttsFailForText],
    storageFailNextN: fakeControl.storageFailNextN,
    storageFailForPath: [...fakeControl.storageFailForPath],
    callCount: fakeControl.calls.length,
    calls: fakeControl.calls.slice(-50),
  });
}

export async function POST(req: NextRequest | Request): Promise<Response> {
  if (!isFakeMode()) return new NextResponse(null, { status: 404 });
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.reset === true) {
    fakeControl.reset();
    const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
    fakeStorageReset();
    return NextResponse.json({ ok: true });
  }
  if (typeof body.ttsFailNextN === 'number') {
    fakeControl.ttsFailNextN = body.ttsFailNextN;
  }
  if (Array.isArray(body.ttsFailForText)) {
    fakeControl.ttsFailForText = new Set(body.ttsFailForText as string[]);
  }
  if (typeof body.storageFailNextN === 'number') {
    fakeControl.storageFailNextN = body.storageFailNextN;
  }
  if (Array.isArray(body.storageFailForPath)) {
    fakeControl.storageFailForPath = new Set(body.storageFailForPath as string[]);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/integration/fake-control-route.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add app/api/__fake_control/route.ts tests/integration/fake-control-route.test.ts
git commit -m "feat(test): /api/__fake_control HTTP control plane (404 in production)"
```

---

## Task 9: Integration test fixtures helper

**Files:**
- Create: `tests/integration/_fixtures.ts`

Reusable DB fixture builder. Subsequent integration tests import from here.

- [ ] **Step 1: Write the helper**

```ts
// tests/integration/_fixtures.ts
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

export type Fixture = {
  seriesId: string;
  titleId: string;
  questionIds: string[];
  cleanup: () => Promise<void>;
};

const SAMPLE_SOURCE = `Once upon a time, in a land far far away, there lived a brave little fox who loved adventures and exploring the deep forest with his three best friends. They went on many quests together and learned about kindness.`;

export async function createTitleWithQuestions(opts: {
  status?: 'draft' | 'published';
  questionCount?: number;
} = {}): Promise<Fixture> {
  const status = opts.status ?? 'draft';
  const n = opts.questionCount ?? 3;
  const seriesId = crypto.randomUUID();
  const titleId = crypto.randomUUID();

  await db.insert(schema.series).values({
    id: seriesId,
    kind: 'book',
    title: 'fixture-' + seriesId.slice(0, 6),
  });
  await db.insert(schema.title).values({
    id: titleId,
    seriesId,
    name: 'fixture title',
    isLong: false,
    status,
  });
  await db.insert(schema.sourceMaterial).values({
    ownerType: 'title',
    ownerId: titleId,
    text: SAMPLE_SOURCE,
  });

  const questionIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    questionIds.push(id);
    await db.insert(schema.question).values({
      id,
      ownerType: 'title',
      ownerId: titleId,
      category: i % 3 === 0 ? 'vocab' : i % 3 === 1 ? 'sentence' : 'reading',
      stem: `Q${i}: what is x${i}?`,
      options: [`a${i}`, `b${i}`, `c${i}`],
      correctIndex: i % 3,
      explanation: `中文解释 ${i}`,
      orderIndex: i,
    });
  }

  return {
    seriesId,
    titleId,
    questionIds,
    cleanup: async () => {
      // Clean polymorphic-owner tables manually (no FK cascade), then series
      // (which cascades title via FK).
      await db
        .delete(schema.question)
        .where(eq(schema.question.ownerId, titleId));
      await db
        .delete(schema.sourceMaterial)
        .where(eq(schema.sourceMaterial.ownerId, titleId));
      await db.delete(schema.series).where(eq(schema.series.id, seriesId));
    },
  };
}

export async function readSseEvents(res: Response): Promise<unknown[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: unknown[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i = buffer.indexOf('\n\n');
    while (i !== -1) {
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      i = buffer.indexOf('\n\n');
      if (raw.startsWith('data: ')) events.push(JSON.parse(raw.slice(6)));
    }
  }
  return events;
}
```

- [ ] **Step 2: Commit (no test for the helper itself; it's exercised by every subsequent test)**

```bash
git add tests/integration/_fixtures.ts
git commit -m "test: shared DB fixture + SSE reader for integration tests"
```

---

## Task 10: /api/publish integration test

**Files:**
- Create: `tests/integration/publish.test.ts`

Tests the SSE flow end-to-end: status flip on success, no-flip on failure, cache hit on republish.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/publish.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { POST } from '@/app/api/publish/route';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { fakeControl } from '@/lib/tts/fake-control';
import { createTitleWithQuestions, readSseEvents, type Fixture } from './_fixtures';

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) await fx.cleanup();
  fx = null;
});

function publishReq(ownerId: string): Request {
  return new Request('http://test/api/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ownerType: 'title', ownerId }),
  });
}

describe('/api/publish (SSE)', () => {
  it('happy path: streams start → progress → done; flips status to published', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    const res = await POST(publishReq(fx.titleId));
    const events = await readSseEvents(res);

    const types = events.map((e: any) => e.type);
    expect(types[0]).toBe('start');
    expect(types[types.length - 1]).toBe('done');
    expect(types).not.toContain('error');

    const start = events[0] as any;
    expect(start.total).toBe(12); // 3 questions × 4 fields
    expect(start.questions).toBe(3);

    const progresses = events.filter((e: any) => e.type === 'progress') as any[];
    expect(progresses.length).toBeGreaterThan(0);
    expect(progresses[progresses.length - 1].done).toBe(12);

    const [row] = await db
      .select({ status: schema.title.status })
      .from(schema.title)
      .where(eq(schema.title.id, fx.titleId));
    expect(row?.status).toBe('published');
  });

  it('republish hits cache: generated=0, cached=total, near-instant', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    await readSseEvents(await POST(publishReq(fx.titleId))); // first publish
    await db
      .update(schema.title)
      .set({ status: 'draft' })
      .where(eq(schema.title.id, fx.titleId));
    fakeControl.calls.length = 0;

    const events = await readSseEvents(await POST(publishReq(fx.titleId)));
    const progresses = events.filter((e: any) => e.type === 'progress') as any[];
    const last = progresses[progresses.length - 1];
    expect(last.cached).toBe(12);
    expect(last.generated).toBe(0);

    // No TTS calls were made on the second publish.
    const tts = fakeControl.calls.filter((c) => c.kind === 'tts').length;
    expect(tts).toBe(0);
  });

  it('failure path: any TTS failure → error event, status stays draft', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    fakeControl.ttsFailNextN = 1; // first synthesize call fails

    const events = await readSseEvents(await POST(publishReq(fx.titleId)));
    const errors = events.filter((e: any) => e.type === 'error');
    expect(errors.length).toBe(1);
    expect((errors[0] as any).message).toMatch(/语音生成失败/);

    const [row] = await db
      .select({ status: schema.title.status })
      .from(schema.title)
      .where(eq(schema.title.id, fx.titleId));
    expect(row?.status).toBe('draft');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/integration/publish.test.ts`
Expected: 3 passing. (`/api/publish/route.ts` already exists and the fakes are now wired in.)

If the test that depends on `_fixtures.ts` blows up because the local `quiz_test` DB doesn't exist or migrations aren't applied, fix the DB before continuing — see plan prereq.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/publish.test.ts
git commit -m "test: /api/publish SSE — happy, cache-hit, failure"
```

---

## Task 11: cascadeOwners integration test

**Files:**
- Create: `tests/integration/cascade.test.ts`

Tests that cascadeOwners deletes DB rows even if storage cleanup fails (the `Promise.all(...catch)` in `_cascade.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/cascade.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { cascadeOwners } from '@/lib/db/actions/_cascade';
import { fakeControl } from '@/lib/tts/fake-control';
import { fakeUpload, fakeExists } from '@/lib/tts/storage-fake';
import { createTitleWithQuestions, type Fixture } from './_fixtures';

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) await fx.cleanup();
  fx = null;
});

describe('cascadeOwners', () => {
  it('deletes question + source_material rows, then removes their audio', async () => {
    fx = await createTitleWithQuestions({ questionCount: 2 });
    // Pre-populate fake storage as if these questions had audio cached.
    for (const qid of fx.questionIds) {
      await fakeUpload(`${qid}/stem.mp3`, Buffer.from('x'));
      await fakeUpload(`${qid}/option0.mp3`, Buffer.from('y'));
    }

    await cascadeOwners([{ type: 'title', id: fx.titleId }]);

    const remainingQ = await db
      .select({ id: schema.question.id })
      .from(schema.question)
      .where(eq(schema.question.ownerId, fx.titleId));
    const remainingSm = await db
      .select({ ownerId: schema.sourceMaterial.ownerId })
      .from(schema.sourceMaterial)
      .where(
        and(
          eq(schema.sourceMaterial.ownerType, 'title'),
          eq(schema.sourceMaterial.ownerId, fx.titleId),
        ),
      );
    expect(remainingQ).toHaveLength(0);
    expect(remainingSm).toHaveLength(0);

    for (const qid of fx.questionIds) {
      expect(await fakeExists(`${qid}/stem.mp3`)).toBe(false);
      expect(await fakeExists(`${qid}/option0.mp3`)).toBe(false);
    }
  });

  it('still deletes DB rows when storage removePrefix throws (best-effort audio cleanup)', async () => {
    fx = await createTitleWithQuestions({ questionCount: 1 });
    const qid = fx.questionIds[0]!;
    await fakeUpload(`${qid}/stem.mp3`, Buffer.from('x'));

    // Force every storage op to fail.
    fakeControl.storageFailNextN = 999;

    // Should not throw — audio failures are caught and logged.
    await cascadeOwners([{ type: 'title', id: fx.titleId }]);

    const remainingQ = await db
      .select({ id: schema.question.id })
      .from(schema.question)
      .where(eq(schema.question.ownerId, fx.titleId));
    expect(remainingQ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/integration/cascade.test.ts`
Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cascade.test.ts
git commit -m "test: cascadeOwners deletes DB rows + best-effort audio cleanup"
```

---

## Task 12: regenerateOne block-on-published integration test

**Files:**
- Create: `tests/integration/regenerate-one.test.ts`

Covers: 409-equivalent error when published; audio invalidation on draft regen.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/regenerate-one.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { regenerateOne } from '@/lib/db/actions/regenerate-one';
import { fakeUpload, fakeExists } from '@/lib/tts/storage-fake';
import { createTitleWithQuestions, type Fixture } from './_fixtures';

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) await fx.cleanup();
  fx = null;
});

describe('regenerateOne', () => {
  it('returns error when owner is published', async () => {
    fx = await createTitleWithQuestions({ status: 'published', questionCount: 3 });
    const res = await regenerateOne(
      { questionId: fx.questionIds[0]! },
      '/admin/titles/x/review',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/已发布/);
    }
  });

  it('invalidates that question audio on draft regen (and only that question)', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 2 });
    const [q0, q1] = fx.questionIds as [string, string];
    await fakeUpload(`${q0}/stem.mp3`, Buffer.from('x'));
    await fakeUpload(`${q0}/option0.mp3`, Buffer.from('y'));
    await fakeUpload(`${q1}/stem.mp3`, Buffer.from('z'));

    const res = await regenerateOne(
      { questionId: q0 },
      '/admin/titles/x/review',
    );
    expect(res.ok).toBe(true);

    expect(await fakeExists(`${q0}/stem.mp3`)).toBe(false);
    expect(await fakeExists(`${q0}/option0.mp3`)).toBe(false);
    // q1's audio untouched.
    expect(await fakeExists(`${q1}/stem.mp3`)).toBe(true);

    // Question still exists in DB (UPDATE in place; not deleted).
    const [row] = await db
      .select({ id: schema.question.id, stem: schema.question.stem })
      .from(schema.question)
      .where(eq(schema.question.id, q0));
    expect(row?.id).toBe(q0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/integration/regenerate-one.test.ts`
Expected: 2 passing. (Both code paths already implemented; this just locks them in with tests.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/regenerate-one.test.ts
git commit -m "test: regenerateOne — block on published, audio invalidation on draft"
```

---

## Task 13: /api/generate block + orphan cleanup test

**Files:**
- Create: `tests/integration/generate-block.test.ts`

Covers: 409 on published; orphan audio cleanup runs when re-generating from draft.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/generate-block.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { POST } from '@/app/api/generate/route';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { fakeUpload, fakeExists } from '@/lib/tts/storage-fake';
import { fakeControl } from '@/lib/tts/fake-control';
import { createTitleWithQuestions, readSseEvents, type Fixture } from './_fixtures';

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) await fx.cleanup();
  fx = null;
});

function generateReq(ownerId: string): Request {
  return new Request('http://test/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ownerType: 'title', ownerId }),
  });
}

describe('/api/generate', () => {
  it('returns 409 when owner is published', async () => {
    fx = await createTitleWithQuestions({ status: 'published', questionCount: 3 });
    const res = await POST(generateReq(fx.titleId));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/已发布/);
  });

  it('on draft regen, removes audio for the soon-to-be-deleted old questions', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    for (const qid of fx.questionIds) {
      await fakeUpload(`${qid}/stem.mp3`, Buffer.from('x'));
    }

    fakeControl.calls.length = 0;
    const res = await POST(generateReq(fx.titleId));
    // /api/generate streams SSE; consume to completion.
    await readSseEvents(res);

    // The old questions' audio should be gone (their ids no longer exist
    // either — replaced by fresh ones from fake LLM).
    for (const qid of fx.questionIds) {
      expect(await fakeExists(`${qid}/stem.mp3`)).toBe(false);
    }
    // Verify removePrefix was called for each old id.
    const removed = fakeControl.calls
      .filter((c) => c.kind === 'storage' && c.op === 'removePrefix')
      .map((c) => (c as { path: string }).path);
    for (const qid of fx.questionIds) {
      expect(removed).toContain(qid);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/integration/generate-block.test.ts`
Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/generate-block.test.ts
git commit -m "test: /api/generate — 409 on published, orphan audio cleanup"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: all tests pass. Note the count (should be ~25-30 new tests added on top of pre-existing).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: green build, all routes registered including `/api/__fake_control`.

- [ ] **Step 4: Verify production behavior is unchanged**

Confirm by inspection of `lib/tts/azure.ts` and `lib/tts/storage.ts`:
- The `if (process.env.USE_FAKE_*)` checks are first lines of each function
- When the env var is `'false'` or unset, control falls through to the original real implementation byte-for-byte
- The `app/api/__fake_control/route.ts` route returns 404 unless a fake flag is `'true'`

No code changes needed in this step — just visually confirm.

- [ ] **Step 5: Final commit (if any uncommitted churn)**

```bash
git status
# If clean, nothing to do. Otherwise:
git add -p
git commit -m "chore: post-test cleanup"
```

---

## Coverage Summary (against spec §6)

| Spec scenario | Covered by |
|---|---|
| `runJobs` reports `failed > 0` | Task 7 |
| `/api/publish` does not flip status when audio fails | Task 10 |
| `/api/publish` cache-hit: republish has `cached === total` | Task 10 |
| `cascadeOwners` deletes DB rows even when storage fails | Task 11 |
| `regenerateOne` returns ok / blocks on published | Task 12 |
| `/api/generate` 409 on published | Task 13 |
| `/api/generate` orphan-audio cleanup runs | Task 13 |

## Self-Review Notes

**Spec coverage:** all six concrete test scenarios in §6 of the spec map to a task. The HTTP control plane (§4.5) is covered by Task 8. The setup file pattern (§4.6) is Task 4. Both fake modules (§4.2, §4.3) are Tasks 2 + 3.

**Type consistency:** `FakeInjectedError`, `StorageOp`, `CallLogEntry`, `Progress`, `AudioQuestion` are all named identically across tasks. `runJobs` signature `(jobs, onProgress, opts?)` matches `precompute.ts:runJobs`. `cascadeOwners(owners)` matches `_cascade.ts`.

**No placeholders:** all code blocks contain real, paste-able TypeScript. No "TBD", no "implement similar to".

**Bite-sized:** every task has 3-6 numbered steps. Each step is a single concrete action. Each task ends with a commit.
