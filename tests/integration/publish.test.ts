import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/publish/route';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { fakeControl } from '@/lib/tts/fake-control';
import { createTitleWithQuestions, readSseEvents, type Fixture } from './_fixtures';

let fx: Fixture | null = null;
afterEach(async () => {
  if (fx) await fx.cleanup();
  fx = null;
});

function publishReq(ownerId: string): NextRequest {
  return new NextRequest('http://test/api/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ownerType: 'title', ownerId }),
  });
}

describe('/api/publish (SSE)', () => {
  it('happy path: streams start → progress → done; flips status to published', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    const res = await POST(publishReq(fx.titleId));
    const events = await readSseEvents(res);

    const types = events.map((e: any) => e.type);
    expect(types[0]).toBe('start');
    expect(types[types.length - 1]).toBe('done');
    expect(types).not.toContain('error');

    const start = events[0] as any;
    expect(start.total).toBe(12); // 3 questions × 4 fields
    expect(start.questions).toBe(3);

    const progresses = events.filter((e: any) => e.type === 'progress') as any[];
    expect(progresses.length).toBeGreaterThan(0);
    expect(progresses[progresses.length - 1].done).toBe(12);

    const [row] = await db
      .select({ status: schema.title.status })
      .from(schema.title)
      .where(eq(schema.title.id, fx.titleId));
    expect(row?.status).toBe('published');
  });

  it('republish hits cache: generated=0, cached=total, near-instant', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    await readSseEvents(await POST(publishReq(fx.titleId))); // first publish
    await db
      .update(schema.title)
      .set({ status: 'draft' })
      .where(eq(schema.title.id, fx.titleId));
    fakeControl.calls.length = 0;

    const events = await readSseEvents(await POST(publishReq(fx.titleId)));
    const progresses = events.filter((e: any) => e.type === 'progress') as any[];
    const last = progresses[progresses.length - 1];
    expect(last.cached).toBe(12);
    expect(last.generated).toBe(0);

    // No TTS calls were made on the second publish.
    const tts = fakeControl.calls.filter((c) => c.kind === 'tts').length;
    expect(tts).toBe(0);
  });

  it('failure path: any TTS failure → error event, status stays draft', async () => {
    fx = await createTitleWithQuestions({ status: 'draft', questionCount: 3 });
    fakeControl.ttsFailNextN = 1; // first synthesize call fails

    const events = await readSseEvents(await POST(publishReq(fx.titleId)));
    const errors = events.filter((e: any) => e.type === 'error');
    expect(errors.length).toBe(1);
    expect((errors[0] as any).message).toMatch(/语音生成失败/);

    const [row] = await db
      .select({ status: schema.title.status })
      .from(schema.title)
      .where(eq(schema.title.id, fx.titleId));
    expect(row?.status).toBe('draft');
  });
});
