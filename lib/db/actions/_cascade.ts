'use server';

import { and, eq, inArray, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { removePrefix } from '@/lib/tts/storage';

export type Owner = { type: 'title' | 'chapter'; id: string };

/**
 * Hard-delete all questions + source_material for the given owners, then
 * best-effort remove the corresponding audio files from Storage.
 *
 * `question.ownerId` and `source_material.ownerId` are polymorphic (no FK),
 * so they don't cascade automatically when their owning title/chapter row
 * is deleted. Call this BEFORE deleting the owning row(s) so we capture the
 * question ids that need audio cleanup.
 */
export async function cascadeOwners(owners: Owner[]): Promise<void> {
  if (owners.length === 0) return;

  const titleIds = owners.filter((o) => o.type === 'title').map((o) => o.id);
  const chapterIds = owners.filter((o) => o.type === 'chapter').map((o) => o.id);

  // Collect question ids first — we need them for audio cleanup after the
  // DB transaction commits.
  const matchClauses = [];
  if (titleIds.length > 0) {
    matchClauses.push(
      and(
        eq(schema.question.ownerType, 'title'),
        inArray(schema.question.ownerId, titleIds),
      ),
    );
  }
  if (chapterIds.length > 0) {
    matchClauses.push(
      and(
        eq(schema.question.ownerType, 'chapter'),
        inArray(schema.question.ownerId, chapterIds),
      ),
    );
  }

  let questionIds: string[] = [];
  if (matchClauses.length > 0) {
    const where = matchClauses.length === 1 ? matchClauses[0]! : or(...matchClauses)!;
    const rows = await db
      .select({ id: schema.question.id })
      .from(schema.question)
      .where(where);
    questionIds = rows.map((r) => r.id);
  }

  await db.transaction(async (tx) => {
    if (titleIds.length > 0) {
      await tx
        .delete(schema.question)
        .where(
          and(
            eq(schema.question.ownerType, 'title'),
            inArray(schema.question.ownerId, titleIds),
          ),
        );
      await tx
        .delete(schema.sourceMaterial)
        .where(
          and(
            eq(schema.sourceMaterial.ownerType, 'title'),
            inArray(schema.sourceMaterial.ownerId, titleIds),
          ),
        );
    }
    if (chapterIds.length > 0) {
      await tx
        .delete(schema.question)
        .where(
          and(
            eq(schema.question.ownerType, 'chapter'),
            inArray(schema.question.ownerId, chapterIds),
          ),
        );
      await tx
        .delete(schema.sourceMaterial)
        .where(
          and(
            eq(schema.sourceMaterial.ownerType, 'chapter'),
            inArray(schema.sourceMaterial.ownerId, chapterIds),
          ),
        );
    }
  });

  if (questionIds.length > 0) {
    await Promise.all(
      questionIds.map((qid) =>
        removePrefix(qid).catch((e) =>
          console.error('cascade audio cleanup failed', qid, e),
        ),
      ),
    );
  }
}
