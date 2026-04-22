import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { resetForTest as resetCostGuard } from '@/lib/cost-guard';
import { POST as generate } from '@/app/api/generate/route';

describe('/api/generate integration (fake AI, bypassed auth)', () => {
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

  it('generates 10 questions and persists them', async () => {
    const res = await generate(req({ ownerType: 'title', ownerId: titleId }));
    expect(res.status).toBe(200);
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
    await generate(req({ ownerType: 'title', ownerId: titleId }));
    // wait past owner lock
    resetCostGuard();
    await generate(req({ ownerType: 'title', ownerId: titleId }));
    const rows = await db
      .select()
      .from(schema.question)
      .where(
        and(eq(schema.question.ownerType, 'title'), eq(schema.question.ownerId, titleId)),
      );
    expect(rows).toHaveLength(10); // not 20
  });

  it('enforces owner lock within 30s window', async () => {
    await generate(req({ ownerType: 'title', ownerId: titleId }));
    const res = await generate(req({ ownerType: 'title', ownerId: titleId }));
    expect(res.status).toBe(429);
  });
});
