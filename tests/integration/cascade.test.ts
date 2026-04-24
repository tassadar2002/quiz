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
