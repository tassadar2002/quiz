'use server';

import { db, schema } from '@/lib/db/client';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
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
  await db.delete(schema.series).where(eq(schema.series.id, id));
  revalidatePath('/admin');
}
