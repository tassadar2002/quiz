'use server';

import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseOptions } from '@/lib/db/question-helpers';

const AnswerSchema = z.object({
  questionId: z.string().uuid(),
  chosenOptionText: z.string(),
});

const InputSchema = z.object({
  ownerType: z.enum(['title', 'chapter']),
  ownerId: z.string().uuid(),
  answers: z.array(AnswerSchema).min(1).max(50),
});

export type GradeInput = z.infer<typeof InputSchema>;

export type GradeWrongItem = {
  questionId: string;
  stem: string;
  options: string[];
  correctIndex: number;
  chosenIndex: number;
  explanation: string;
};

export type GradeResult = {
  score: number;
  total: number;
  wrong: GradeWrongItem[];
};

export async function gradeQuiz(input: GradeInput): Promise<GradeResult> {
  const parsed = InputSchema.parse(input);
  const rows = await db
    .select()
    .from(schema.question)
    .where(
      and(
        eq(schema.question.ownerType, parsed.ownerType),
        eq(schema.question.ownerId, parsed.ownerId),
      ),
    );
  const byId = new Map(rows.map((q) => [q.id, q]));

  const wrong: GradeWrongItem[] = [];
  let score = 0;

  for (const ans of parsed.answers) {
    const q = byId.get(ans.questionId);
    if (!q) continue;
    const options = parseOptions(q.options);
    const chosenIndex = options.indexOf(ans.chosenOptionText);
    const correct = chosenIndex === q.correctIndex;
    if (correct) {
      score += 1;
    } else {
      wrong.push({
        questionId: q.id,
        stem: q.stem,
        options,
        correctIndex: q.correctIndex,
        chosenIndex,
        explanation: q.explanation,
      });
    }
  }

  return { score, total: parsed.answers.length, wrong };
}
