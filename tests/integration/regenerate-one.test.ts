import { describe, it, expect, afterEach } from 'vitest';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { regenerateOne } from '@/lib/db/actions/regenerate-one';
import { fakeUpload, fakeExists } from '@/lib/tts/storage-fake';
import { fakeControl } from '@/lib/tts/fake-control';
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

  it('returns ok=true even when audio invalidation throws (best-effort)', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 1 });
    const qid = fx.questionIds[0]!;
    await fakeUpload(`${qid}/stem.mp3`, Buffer.from('x'));

    // Force the removePrefix call inside regenerateOne to throw — this
    // exercises the catch around audio invalidation in regenerate-one.ts.
    fakeControl.storageFailForPath.add(qid);

    const res = await regenerateOne(
      { questionId: qid },
      '/admin/titles/x/review',
    );
    // Storage failure must not surface to the caller.
    expect(res.ok).toBe(true);

    // Question still updated in DB regardless.
    const [row] = await db
      .select({ id: schema.question.id })
      .from(schema.question)
      .where(eq(schema.question.id, qid));
    expect(row?.id).toBe(qid);
  });
});
