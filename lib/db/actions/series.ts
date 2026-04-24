'use server';

import { db, schema } from '@/lib/db/client';
import { eq, asc, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { cascadeOwners, type Owner } from './_cascade';
import { z } from 'zod';

const CreateInput = z.object({
  kind: z.enum(['book', 'animation']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function listSeries() {
  return db.select().from(schema.series).orderBy(asc(schema.series.createdAt));
}

export async function createSeries(form: FormData) {
  await requireAdmin();
  const parsed = CreateInput.parse({
    kind: form.get('kind'),
    title: form.get('title'),
    description: form.get('description') || undefined,
  });
  await db.insert(schema.series).values(parsed);
  revalidatePath('/admin');
}

export async function deleteSeries(id: string) {
  await requireAdmin();
  // Same reasoning as deleteTitle: collect title + chapter ids before the
  // series delete cascades them away, so we can clean up the polymorphic
  // question + source_material rows + audio for each.
  const titles = await db
    .select({ id: schema.title.id })
    .from(schema.title)
    .where(eq(schema.title.seriesId, id));
  const titleIds = titles.map((t) => t.id);
  const chapters =
    titleIds.length > 0
      ? await db
          .select({ id: schema.chapter.id })
          .from(schema.chapter)
          .where(inArray(schema.chapter.titleId, titleIds))
      : [];
  const owners: Owner[] = [
    ...titles.map((t) => ({ type: 'title' as const, id: t.id })),
    ...chapters.map((c) => ({ type: 'chapter' as const, id: c.id })),
  ];
  await cascadeOwners(owners);
  await db.delete(schema.series).where(eq(schema.series.id, id));
  revalidatePath('/admin');
  revalidatePath('/');
}
