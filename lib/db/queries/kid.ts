import { db, schema } from '@/lib/db/client';
import { and, eq, sql } from 'drizzle-orm';

export async function listPublicSeries() {
  return db
    .select()
    .from(schema.series)
    .where(
      sql`EXISTS (
        SELECT 1 FROM ${schema.title} t
        WHERE t.series_id = ${schema.series.id}
          AND (
            (t.is_long = false AND t.status = 'published'
              AND (SELECT count(*) FROM ${schema.question} q
                   WHERE q.owner_type = 'title' AND q.owner_id = t.id) >= 3)
            OR (t.is_long = true AND EXISTS (
              SELECT 1 FROM ${schema.chapter} c
              WHERE c.title_id = t.id AND c.status = 'published'
                AND (SELECT count(*) FROM ${schema.question} q
                     WHERE q.owner_type = 'chapter' AND q.owner_id = c.id) >= 3
            ))
          )
      )`,
    );
}

export async function listPublicTitlesInSeries(seriesId: string) {
  return db
    .select()
    .from(schema.title)
    .where(
      and(
        eq(schema.title.seriesId, seriesId),
        sql`(
          (${schema.title.isLong} = false
            AND ${schema.title.status} = 'published'
            AND (SELECT count(*) FROM ${schema.question} q
                 WHERE q.owner_type = 'title' AND q.owner_id = ${schema.title.id}) >= 3)
          OR (${schema.title.isLong} = true
            AND EXISTS (
              SELECT 1 FROM ${schema.chapter} c
              WHERE c.title_id = ${schema.title.id} AND c.status = 'published'
                AND (SELECT count(*) FROM ${schema.question} q
                     WHERE q.owner_type = 'chapter' AND q.owner_id = c.id) >= 3
            ))
        )`,
      ),
    );
}

export async function listPublicChapters(titleId: string) {
  return db
    .select()
    .from(schema.chapter)
    .where(
      and(
        eq(schema.chapter.titleId, titleId),
        eq(schema.chapter.status, 'published'),
        sql`(SELECT count(*) FROM ${schema.question} q
             WHERE q.owner_type = 'chapter' AND q.owner_id = ${schema.chapter.id}) >= 3`,
      ),
    );
}

export async function getPublicTitle(id: string) {
  const [row] = await db.select().from(schema.title).where(eq(schema.title.id, id)).limit(1);
  if (!row) return null;
  if (!row.isLong) {
    // Short title: must be published AND have >= 3 questions
    if (row.status !== 'published') return null;
    const [{ n }] = await db
      .select({
        n: sql<number>`count(*)::int`,
      })
      .from(schema.question)
      .where(
        and(eq(schema.question.ownerType, 'title'), eq(schema.question.ownerId, row.id)),
      );
    if ((n ?? 0) < 3) return null;
    return row;
  }
  // Long title: status is effectively ignored; gate on having at least
  // one published chapter with >= 3 questions.
  const [{ n }] = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(schema.chapter)
    .where(
      and(
        eq(schema.chapter.titleId, row.id),
        eq(schema.chapter.status, 'published'),
        sql`(SELECT count(*) FROM ${schema.question} q
             WHERE q.owner_type = 'chapter' AND q.owner_id = ${schema.chapter.id}) >= 3`,
      ),
    );
  if ((n ?? 0) === 0) return null;
  return row;
}

export async function getPublicChapter(id: string) {
  const [row] = await db
    .select()
    .from(schema.chapter)
    .where(and(eq(schema.chapter.id, id), eq(schema.chapter.status, 'published')))
    .limit(1);
  return row ?? null;
}

export async function getQuestionsForOwner(
  ownerType: 'title' | 'chapter',
  ownerId: string,
) {
  return db
    .select()
    .from(schema.question)
    .where(
      and(eq(schema.question.ownerType, ownerType), eq(schema.question.ownerId, ownerId)),
    );
}

export async function getSeriesById(id: string) {
  const [row] = await db.select().from(schema.series).where(eq(schema.series.id, id)).limit(1);
  return row ?? null;
}
