'use server';

import { db, schema } from '@/lib/db/client';
import { and, eq, asc, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const MIN_QUESTIONS_TO_PUBLISH = 3;

const CreateInput = z.object({
  seriesId: z.string().uuid(),
  name: z.string().min(1).max(300),
  isLong: z.boolean().default(false),
});

export async function listTitles(seriesId: string) {
  return db
    .select()
    .from(schema.title)
    .where(eq(schema.title.seriesId, seriesId))
    .orderBy(asc(schema.title.orderIndex), asc(schema.title.createdAt));
}

export async function getTitle(id: string) {
  const [row] = await db.select().from(schema.title).where(eq(schema.title.id, id)).limit(1);
  return row ?? null;
}

async function revalidateForTitle(id: string) {
  const t = await getTitle(id);
  if (t) {
    revalidatePath('/');
    revalidatePath(`/s/${t.seriesId}`);
    revalidatePath(`/t/${id}`);
  }
}

export async function createTitle(form: FormData) {
  await requireAdmin();
  const input = CreateInput.parse({
    seriesId: form.get('seriesId'),
    name: form.get('name'),
    isLong: form.get('isLong') === 'on',
  });
  await db.insert(schema.title).values(input);
  revalidatePath(`/admin/series/${input.seriesId}`);
}

export async function deleteTitle(id: string, seriesId: string) {
  await requireAdmin();
  await db.delete(schema.title).where(eq(schema.title.id, id));
  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath('/');
  revalidatePath(`/s/${seriesId}`);
}

export async function publishTitle(id: string) {
  await requireAdmin();
  const [row] = await db
    .select({ isLong: schema.title.isLong })
    .from(schema.title)
    .where(eq(schema.title.id, id))
    .limit(1);
  if (!row) throw new Error('title not found');
  if (!row.isLong) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.question)
      .where(
        and(eq(schema.question.ownerType, 'title'), eq(schema.question.ownerId, id)),
      );
    if ((n ?? 0) < MIN_QUESTIONS_TO_PUBLISH) {
      throw new Error(`发布需要至少 ${MIN_QUESTIONS_TO_PUBLISH} 道题`);
    }
  }
  await db.update(schema.title).set({ status: 'published' }).where(eq(schema.title.id, id));
  revalidatePath(`/admin/titles/${id}`);
  await revalidateForTitle(id);
}

export async function unpublishTitle(id: string) {
  await requireAdmin();
  await db.update(schema.title).set({ status: 'draft' }).where(eq(schema.title.id, id));
  revalidatePath(`/admin/titles/${id}`);
  await revalidateForTitle(id);
}
