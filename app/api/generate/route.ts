import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guard';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { generateQuestionsStream } from '@/lib/ai/generate';
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

  const encoder = new TextEncoder();
  const text = sm.text;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        for await (const event of generateQuestionsStream(text)) {
          if (event.type === 'chunk') {
            send({ type: 'chunk', text: event.text });
            continue;
          }
          if (event.type === 'error') {
            send({ type: 'error', message: event.message });
            controller.close();
            return;
          }
          // done — persist and emit final event
          try {
            await db
              .delete(schema.question)
              .where(
                and(
                  eq(schema.question.ownerType, ownerType),
                  eq(schema.question.ownerId, ownerId),
                ),
              );
            await db.insert(schema.question).values(
              event.response.questions.map((q, i) => ({
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
            // Invalidate any cached RSC payload for the review page so the
            // admin sees the NEW question ids after regeneration. Without
            // this, router.push to the review page may serve a stale payload
            // whose ids no longer exist in the DB — inline edits on those
            // stale rows then silently update zero rows.
            const reviewPath =
              ownerType === 'title'
                ? `/admin/titles/${ownerId}/review`
                : `/admin/chapters/${ownerId}/review`;
            const editPath =
              ownerType === 'title'
                ? `/admin/titles/${ownerId}`
                : `/admin/chapters/${ownerId}`;
            // revalidatePath requires Next's request store, which is absent
            // when this route is invoked by vitest. Swallow the invariant.
            try { revalidatePath(reviewPath); } catch {}
            try { revalidatePath(editPath); } catch {}
            send({ type: 'done', count: event.response.questions.length });
          } catch (err) {
            console.error('persist failed', err);
            send({ type: 'error', message: '写入数据库失败' });
          }
        }
      } catch (err) {
        console.error('stream failed', err);
        send({
          type: 'error',
          message: err instanceof Error ? err.message : '内部错误',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
