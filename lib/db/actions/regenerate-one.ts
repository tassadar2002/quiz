'use server';

import { db, schema } from '@/lib/db/client';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { regenerateOneQuestion, GenerateError } from '@/lib/ai/generate';
import { acquireGenerateSlot } from '@/lib/cost-guard';
import { revalidatePath } from 'next/cache';
import { removePrefix } from '@/lib/tts/storage';
import { jobsForQuestions, runJobs } from '@/lib/tts/precompute';
import { z } from 'zod';

async function isOwnerPublished(
  ownerType: 'title' | 'chapter',
  ownerId: string,
): Promise<boolean> {
  if (ownerType === 'title') {
    const [row] = await db
      .select({ status: schema.title.status })
      .from(schema.title)
      .where(eq(schema.title.id, ownerId))
      .limit(1);
    return row?.status === 'published';
  }
  const [row] = await db
    .select({ status: schema.chapter.status })
    .from(schema.chapter)
    .where(eq(schema.chapter.id, ownerId))
    .limit(1);
  return row?.status === 'published';
}

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

    // Invalidate any cached audio for this question (text changed → audio is
    // stale). If the owner is currently published, regenerate inline so the
    // live quiz never has missing audio.
    try {
      await removePrefix(q.id);
      if (await isOwnerPublished(q.ownerType, q.ownerId)) {
        const jobs = jobsForQuestions([
          { id: q.id, stem: fresh.stem, options: fresh.options },
        ]);
        await runJobs(jobs, () => {}, { force: true });
      }
    } catch (audioErr) {
      // Don't fail the regen on audio issues — admin can re-publish to fix.
      console.error('audio invalidate/regen failed', audioErr);
    }

    revalidatePath(revalidateHref);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof GenerateError ? err.message : 'AI 生成失败';
    return { ok: false, error: msg };
  }
}
