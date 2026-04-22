import './env-load';
import { db, schema } from '@/lib/db/client';
import { fakeGenerateResponse } from '@/lib/ai/fake';
import { eq } from 'drizzle-orm';

const SENTINEL_TITLE = '__e2e_sentinel_9f3b_do_not_edit__';

export async function seedKidData() {
  // Clean previous E2E data
  const existing = await db
    .select()
    .from(schema.series)
    .where(eq(schema.series.title, SENTINEL_TITLE));
  for (const s of existing) {
    await db.delete(schema.series).where(eq(schema.series.id, s.id));
  }

  const [s] = await db
    .insert(schema.series)
    .values({ kind: 'book', title: SENTINEL_TITLE })
    .returning();
  const [t] = await db
    .insert(schema.title)
    .values({ seriesId: s.id, name: 'E2E Short Title', status: 'published' })
    .returning();
  const { questions } = fakeGenerateResponse();
  await db.insert(schema.question).values(
    questions.map((q, i) => ({
      ownerType: 'title' as const,
      ownerId: t.id,
      category: q.category,
      stem: q.stem,
      options: q.options,
      correctIndex: q.correct_index,
      explanation: q.explanation,
      orderIndex: i,
    })),
  );
  return { seriesId: s.id, titleId: t.id };
}
