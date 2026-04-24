import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/guard';
import { jobsForQuestions, runJobs, type Progress } from '@/lib/tts/precompute';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MIN_QUESTIONS_TO_PUBLISH = 3;

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
  const parsed = Input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad input' }, { status: 400 });
  }
  const { ownerType, ownerId } = parsed.data;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const questions = await db
          .select({
            id: schema.question.id,
            stem: schema.question.stem,
            options: schema.question.options,
          })
          .from(schema.question)
          .where(
            and(
              eq(schema.question.ownerType, ownerType),
              eq(schema.question.ownerId, ownerId),
            ),
          );

        if (questions.length < MIN_QUESTIONS_TO_PUBLISH) {
          send({
            type: 'error',
            message: `发布需要至少 ${MIN_QUESTIONS_TO_PUBLISH} 道题`,
          });
          controller.close();
          return;
        }

        const jobs = jobsForQuestions(questions);
        send({ type: 'start', total: jobs.length, questions: questions.length });

        const final: Progress = await runJobs(jobs, (p) => {
          send({
            type: 'progress',
            done: p.done,
            total: p.total,
            generated: p.generated,
            cached: p.cached,
            failed: p.failed,
          });
        });

        if (final.failed > 0) {
          send({
            type: 'error',
            message: `语音生成失败 ${final.failed} 个：${final.lastError ?? ''}（已生成的部分已缓存，可重试）`,
          });
          controller.close();
          return;
        }

        if (ownerType === 'title') {
          await db
            .update(schema.title)
            .set({ status: 'published' })
            .where(eq(schema.title.id, ownerId));
          const [t] = await db
            .select({ seriesId: schema.title.seriesId })
            .from(schema.title)
            .where(eq(schema.title.id, ownerId))
            .limit(1);
          try { revalidatePath('/'); } catch {}
          if (t) {
            try { revalidatePath(`/s/${t.seriesId}`); } catch {}
          }
          try { revalidatePath(`/t/${ownerId}`); } catch {}
          try { revalidatePath(`/admin/titles/${ownerId}`); } catch {}
        } else {
          await db
            .update(schema.chapter)
            .set({ status: 'published' })
            .where(eq(schema.chapter.id, ownerId));
          const [c] = await db
            .select({ titleId: schema.chapter.titleId })
            .from(schema.chapter)
            .where(eq(schema.chapter.id, ownerId))
            .limit(1);
          if (c) {
            const [t] = await db
              .select({ seriesId: schema.title.seriesId })
              .from(schema.title)
              .where(eq(schema.title.id, c.titleId))
              .limit(1);
            try { revalidatePath('/'); } catch {}
            if (t) {
              try { revalidatePath(`/s/${t.seriesId}`); } catch {}
            }
            try { revalidatePath(`/t/${c.titleId}`); } catch {}
          }
          try { revalidatePath(`/c/${ownerId}/quiz`); } catch {}
          try { revalidatePath(`/admin/chapters/${ownerId}`); } catch {}
        }

        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : '内部错误';
        send({ type: 'error', message });
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
