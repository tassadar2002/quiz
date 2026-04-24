import { describe, it, expect, afterEach, vi } from 'vitest';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { regenerateOne } from '@/lib/db/actions/regenerate-one';
import { fakeUpload, fakeExists } from '@/lib/tts/storage-fake';
import { createTitleWithQuestions, type Fixture } from './_fixtures';

// Mock revalidatePath to avoid Next.js cache errors in tests
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

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
