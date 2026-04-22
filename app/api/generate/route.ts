import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { generateQuestions, GenerateError } from '@/lib/ai/generate';
import { acquireGenerateSlot } from '@/lib/cost-guard';
import { wordCount } from '@/lib/utils/word-count';
import { z } from 'zod';

const Input = z.object({
  ownerType: z.enum(['title', 'chapter']),
  ownerId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const parse = Input.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: 'bad input' }, { status: 400 });
  }
  const { ownerType, ownerId } = parse.data;

  const [sm] = await db
    .select()
    .from(schema.sourceMaterial)
    .where(
      and(
        eq(schema.sourceMaterial.ownerType, ownerType),
        eq(schema.sourceMaterial.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!sm || wordCount(sm.text) < 50) {
    return NextResponse.json(
      { error: '原文太短或不存在（至少 50 词）' },
      { status: 400 },
    );
  }

  const slot = acquireGenerateSlot(ownerId);
  if (!slot.ok) {
    const map = {
      'owner-locked': '请等待 30 秒后再试',
      'daily-cap': '已达每日生成上限',
    } as const;
    return NextResponse.json({ error: map[slot.reason] }, { status: 429 });
  }

  try {
    const result = await generateQuestions(sm.text);
    await db
      .delete(schema.question)
      .where(
        and(eq(schema.question.ownerType, ownerType), eq(schema.question.ownerId, ownerId)),
      );
    await db.insert(schema.question).values(
      result.questions.map((q, i) => ({
        ownerType,
        ownerId,
        category: q.category,
        stem: q.stem,
        options: q.options,
        correctIndex: q.correct_index,
        explanation: q.explanation,
        orderIndex: i,
      })),
    );
    return NextResponse.json({ ok: true, count: result.questions.length });
  } catch (err) {
    if (err instanceof GenerateError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('generate failed', err);
    return NextResponse.json({ error: '内部错误' }, { status: 500 });
  }
}
