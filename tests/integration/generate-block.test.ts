import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
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

function generateReq(ownerId: string): NextRequest {
  return new NextRequest('http://test/api/generate', {
    method: 'POST',
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

  it('completes regen even when orphan audio cleanup throws (best-effort)', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    // Force every removePrefix call for this title's questions to throw.
    for (const qid of fx.questionIds) {
      fakeControl.storageFailForPath.add(qid);
    }

    const res = await POST(generateReq(fx.titleId));
    const events = await readSseEvents(res);

    // Should still get 'done' (no error event from cleanup failures).
    const types = events.map((e: any) => e.type);
    expect(types[types.length - 1]).toBe('done');
    expect(types).not.toContain('error');

    // New questions inserted; old ids no longer exist in DB.
    const remaining = await db
      .select({ id: schema.question.id })
      .from(schema.question)
      .where(eq(schema.question.ownerId, fx.titleId));
    expect(remaining.length).toBeGreaterThan(0);
    for (const oldId of fx.questionIds) {
      expect(remaining.find((r) => r.id === oldId)).toBeUndefined();
    }
  });
});
