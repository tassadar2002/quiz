'use server';

import { db, schema } from '@/lib/db/client';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateInput = z.object({
  seriesId: z.string().uuid(),
  name: z.string().min(1).max(300),
  isLong: z.coerce.boolean().default(false),
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
}

export async function publishTitle(id: string) {
  await requireAdmin();
  await db.update(schema.title).set({ status: 'published' }).where(eq(schema.title.id, id));
  revalidatePath(`/admin/titles/${id}`);
}

export async function unpublishTitle(id: string) {
  await requireAdmin();
  await db.update(schema.title).set({ status: 'draft' }).where(eq(schema.title.id, id));
  revalidatePath(`/admin/titles/${id}`);
}
