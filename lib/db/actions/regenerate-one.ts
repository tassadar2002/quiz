'use server';

import { db, schema } from '@/lib/db/client';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { regenerateOneQuestion, GenerateError } from '@/lib/ai/generate';
import { acquireGenerateSlot } from '@/lib/cost-guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const Input = z.object({
  questionId: z.string().uuid(),
  userHint: z.string().max(500).optional(),
});

export async function regenerateOne(
  input: z.infer<typeof Input>,
  revalidateHref: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const data = Input.parse(input);

  const [q] = await db
    .select()
    .from(schema.question)
    .where(eq(schema.question.id, data.questionId))
    .limit(1);
  if (!q) return { ok: false, error: '该题目不存在，可能已被覆盖。请刷新。' };

  const [sm] = await db
    .select()
    .from(schema.sourceMaterial)
    .where(
      and(
        eq(schema.sourceMaterial.ownerType, q.ownerType),
        eq(schema.sourceMaterial.ownerId, q.ownerId),
      ),
    )
    .limit(1);
  if (!sm) return { ok: false, error: '找不到原文' };

  // Use the same owner-level lock to prevent spamming
  const slot = acquireGenerateSlot(`regen:${q.ownerId}`);
  if (!slot.ok) {
    return {
      ok: false,
      error: slot.reason === 'owner-locked' ? '请稍候 30 秒再重新生成' : '已达每日生成上限',
    };
  }

  const siblings = await db
    .select({ stem: schema.question.stem })
    .from(schema.question)
    .where(
      and(
        eq(schema.question.ownerType, q.ownerType),
        eq(schema.question.ownerId, q.ownerId),
        ne(schema.question.id, q.id),
      ),
    );

  try {
    const fresh = await regenerateOneQuestion({
      sourceText: sm.text,
      targetCategory: q.category,
      existingOtherStems: siblings.map((s) => s.stem),
      userHint: data.userHint,
    });
    const updated = await db
      .update(schema.question)
      .set({
        category: fresh.category,
        stem: fresh.stem,
        options: fresh.options,
        correctIndex: fresh.correct_index,
        explanation: fresh.explanation,
      })
      .where(eq(schema.question.id, q.id))
      .returning({ id: schema.question.id });
    if (updated.length === 0) {
      return { ok: false, error: '该题目在生成过程中被删除，操作已取消' };
    }
    revalidatePath(revalidateHref);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof GenerateError ? err.message : 'AI 生成失败';
    return { ok: false, error: msg };
  }
}
