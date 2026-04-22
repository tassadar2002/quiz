import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { resetForTest as resetCostGuard } from '@/lib/cost-guard';
import { POST as generate } from '@/app/api/generate/route';

type StreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; count: number }
  | { type: 'error'; message: string };

async function collectStreamEvents(res: Response): Promise<StreamEvent[]> {
  expect(res.body).toBeTruthy();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: StreamEvent[] = [];
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf('\n\n');
      if (!raw.startsWith('data: ')) continue;
      events.push(JSON.parse(raw.slice(6)) as StreamEvent);
    }
  }
  return events;
}

describe('/api/generate integration (fake AI, bypassed auth, SSE stream)', () => {
  let seriesId: string;
  let titleId: string;

  beforeAll(async () => {
    const [s] = await db
      .insert(schema.series)
      .values({ kind: 'book', title: 'integration-test series' })
      .returning();
    seriesId = s.id;
  });

  afterAll(async () => {
    await db.delete(schema.series).where(eq(schema.series.id, seriesId));
  });

  beforeEach(async () => {
    resetCostGuard();
    const [t] = await db
      .insert(schema.title)
      .values({ seriesId, name: 'integration-test title' })
      .returning();
    titleId = t.id;
    await db.insert(schema.sourceMaterial).values({
      ownerType: 'title',
      ownerId: titleId,
      text: 'This is the integration test source material. '.repeat(10),
    });
  });

  function req(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('rejects a bad input body', async () => {
    const res = await generate(req({}));
    expect(res.status).toBe(400);
  });

  it('rejects when source material is missing', async () => {
    const orphan = '00000000-0000-0000-0000-000000000000';
    const res = await generate(req({ ownerType: 'title', ownerId: orphan }));
    expect(res.status).toBe(400);
  });

  it('streams chunks and a done event; persists 10 questions', async () => {
    const res = await generate(req({ ownerType: 'title', ownerId: titleId }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = await collectStreamEvents(res);
    const chunks = events.filter((e) => e.type === 'chunk');
    const done = events.find((e) => e.type === 'done');
    const errors = events.filter((e) => e.type === 'error');
    expect(chunks.length).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
    expect(done).toBeDefined();
    expect(done!.type === 'done' && done!.count).toBe(10);

    const rows = await db
      .select()
      .from(schema.question)
      .where(
        and(eq(schema.question.ownerType, 'title'), eq(schema.question.ownerId, titleId)),
      );
    expect(rows).toHaveLength(10);
    const counts: Record<string, number> = { vocab: 0, sentence: 0, reading: 0 };
    for (const q of rows) counts[q.category]++;
    expect(counts.vocab).toBeGreaterThanOrEqual(2);
    expect(counts.sentence).toBeGreaterThanOrEqual(2);
    expect(counts.reading).toBeGreaterThanOrEqual(2);
  });

  it('replaces existing questions on re-generation', async () => {
    await collectStreamEvents(
      await generate(req({ ownerType: 'title', ownerId: titleId })),
    );
    resetCostGuard();
    await collectStreamEvents(
      await generate(req({ ownerType: 'title', ownerId: titleId })),
    );
    const rows = await db
      .select()
      .from(schema.question)
      .where(
        and(eq(schema.question.ownerType, 'title'), eq(schema.question.ownerId, titleId)),
      );
    expect(rows).toHaveLength(10);
  });

  it('enforces owner lock within 30s window', async () => {
    await collectStreamEvents(
      await generate(req({ ownerType: 'title', ownerId: titleId })),
    );
    const res = await generate(req({ ownerType: 'title', ownerId: titleId }));
    expect(res.status).toBe(429);
  });
});
