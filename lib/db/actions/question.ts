'use server';

import { db, schema } from '@/lib/db/client';
import { and, asc, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { removePrefix } from '@/lib/tts/storage';
import { z } from 'zod';

type OwnerType = 'title' | 'chapter';

export async function listQuestions(ownerType: OwnerType, ownerId: string) {
  return db
    .select()
    .from(schema.question)
    .where(
      and(eq(schema.question.ownerType, ownerType), eq(schema.question.ownerId, ownerId)),
    )
    .orderBy(asc(schema.question.orderIndex));
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  stem: z.string().min(3),
  options: z.array(z.string().min(1)).length(3),
  correctIndex: z.number().int().min(0).max(2),
  explanation: z.string().min(3),
  category: z.enum(['vocab', 'sentence', 'reading']),
});

export async function updateQuestion(
  input: z.infer<typeof UpdateInput>,
  revalidateHref: string,
) {
  await requireAdmin();
  const data = UpdateInput.parse(input);
  const updated = await db
    .update(schema.question)
    .set({
      stem: data.stem,
      options: data.options,
      correctIndex: data.correctIndex,
      explanation: data.explanation,
      category: data.category,
    })
    .where(eq(schema.question.id, data.id))
    .returning({ id: schema.question.id });
  if (updated.length === 0) {
    throw new Error(
      '该题目不存在，可能已被重新生成覆盖。请刷新后再试。',
    );
  }
  revalidatePath(revalidateHref);
}

export async function deleteQuestion(id: string, revalidateHref: string) {
  await requireAdmin();
  const deleted = await db
    .delete(schema.question)
    .where(eq(schema.question.id, id))
    .returning({ id: schema.question.id });
  if (deleted.length === 0) {
    throw new Error(
      '该题目不存在，可能已被重新生成覆盖。请刷新后再试。',
    );
  }
  try {
    await removePrefix(id);
  } catch (e) {
    console.error('audio cleanup failed for deleted question', id, e);
  }
  revalidatePath(revalidateHref);
}
