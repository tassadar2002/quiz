'use server';

import { db, schema } from '@/lib/db/client';
import { and, eq, asc, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { cascadeOwners } from './_cascade';
import { z } from 'zod';

const MIN_QUESTIONS_TO_PUBLISH = 3;

const CreateInput = z.object({
  titleId: z.string().uuid(),
  name: z.string().min(1).max(300),
});

export async function listChapters(titleId: string) {
  return db
    .select()
    .from(schema.chapter)
    .where(eq(schema.chapter.titleId, titleId))
    .orderBy(asc(schema.chapter.orderIndex), asc(schema.chapter.createdAt));
}

export async function getChapter(id: string) {
  const [row] = await db.select().from(schema.chapter).where(eq(schema.chapter.id, id)).limit(1);
  return row ?? null;
}

async function revalidateForChapter(id: string) {
  const c = await getChapter(id);
  if (!c) return;
  const [t] = await db
    .select({ seriesId: schema.title.seriesId })
    .from(schema.title)
    .where(eq(schema.title.id, c.titleId))
    .limit(1);
  if (t) {
    revalidatePath('/');
    revalidatePath(`/s/${t.seriesId}`);
  }
  revalidatePath(`/t/${c.titleId}`);
  revalidatePath(`/c/${id}/quiz`);
}

export async function createChapter(form: FormData) {
  await requireAdmin();
  const input = CreateInput.parse({
    titleId: form.get('titleId'),
    name: form.get('name'),
  });
  await db.insert(schema.chapter).values(input);
  revalidatePath(`/admin/titles/${input.titleId}`);
}

export async function deleteChapter(id: string, titleId: string) {
  await requireAdmin();
  await cascadeOwners([{ type: 'chapter', id }]);
  await db.delete(schema.chapter).where(eq(schema.chapter.id, id));
  revalidatePath(`/admin/titles/${titleId}`);
  revalidatePath(`/t/${titleId}`);
  revalidatePath('/');
}

export async function publishChapter(id: string) {
  await requireAdmin();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.question)
    .where(
      and(eq(schema.question.ownerType, 'chapter'), eq(schema.question.ownerId, id)),
    );
  if ((n ?? 0) < MIN_QUESTIONS_TO_PUBLISH) {
    throw new Error(`发布需要至少 ${MIN_QUESTIONS_TO_PUBLISH} 道题`);
  }
  await db.update(schema.chapter).set({ status: 'published' }).where(eq(schema.chapter.id, id));
  revalidatePath(`/admin/chapters/${id}`);
  await revalidateForChapter(id);
}

export async function unpublishChapter(id: string) {
  await requireAdmin();
  await db.update(schema.chapter).set({ status: 'draft' }).where(eq(schema.chapter.id, id));
  revalidatePath(`/admin/chapters/${id}`);
  await revalidateForChapter(id);
}
