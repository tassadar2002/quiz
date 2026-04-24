import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

export type Fixture = {
  seriesId: string;
  titleId: string;
  questionIds: string[];
  cleanup: () => Promise<void>;
};

const SAMPLE_SOURCE = `Once upon a time, in a land far far away, there lived a brave little fox who loved adventures and exploring the deep forest with his three best friends. They went on many quests together and learned about kindness. `.repeat(2);

export async function createTitleWithQuestions(opts: {
  status?: 'draft' | 'published';
  questionCount?: number;
} = {}): Promise<Fixture> {
  const status = opts.status ?? 'draft';
  const n = opts.questionCount ?? 3;
  const seriesId = crypto.randomUUID();
  const titleId = crypto.randomUUID();

  await db.insert(schema.series).values({
    id: seriesId,
    kind: 'book',
    title: 'fixture-' + seriesId.slice(0, 6),
  });
  await db.insert(schema.title).values({
    id: titleId,
    seriesId,
    name: 'fixture title',
    isLong: false,
    status,
  });
  await db.insert(schema.sourceMaterial).values({
    ownerType: 'title',
    ownerId: titleId,
    text: SAMPLE_SOURCE,
  });

  const questionIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    questionIds.push(id);
    await db.insert(schema.question).values({
      id,
      ownerType: 'title',
      ownerId: titleId,
      category: i % 3 === 0 ? 'vocab' : i % 3 === 1 ? 'sentence' : 'reading',
      stem: `Q${i}: what is x${i}?`,
      options: [`a${i}`, `b${i}`, `c${i}`],
      correctIndex: i % 3,
      explanation: `中文解释 ${i}`,
      orderIndex: i,
    });
  }

  return {
    seriesId,
    titleId,
    questionIds,
    cleanup: async () => {
      // Clean polymorphic-owner tables manually (no FK cascade), then series
      // (which cascades title via FK).
      await db
        .delete(schema.question)
        .where(eq(schema.question.ownerId, titleId));
      await db
        .delete(schema.sourceMaterial)
        .where(eq(schema.sourceMaterial.ownerId, titleId));
      await db.delete(schema.series).where(eq(schema.series.id, seriesId));
    },
  };
}

export async function readSseEvents(res: Response): Promise<unknown[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: unknown[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i = buffer.indexOf('\n\n');
    while (i !== -1) {
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      i = buffer.indexOf('\n\n');
      if (raw.startsWith('data: ')) events.push(JSON.parse(raw.slice(6)));
    }
  }
  return events;
}
