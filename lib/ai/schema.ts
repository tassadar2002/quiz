import { z } from 'zod';

export const QuestionSchema = z.object({
  category: z.enum(['vocab', 'sentence', 'reading']),
  stem: z.string().min(5),
  options: z.array(z.string().min(1)).length(3),
  correct_index: z.number().int().min(0).max(2),
  explanation: z.string().min(5),
});

export const GenerateResponseSchema = z
  .object({
    questions: z.array(QuestionSchema).length(10),
  })
  .refine(
    ({ questions }) => {
      const counts = { vocab: 0, sentence: 0, reading: 0 };
      for (const q of questions) counts[q.category]++;
      return (
        counts.vocab >= 2 &&
        counts.vocab <= 5 &&
        counts.sentence >= 2 &&
        counts.sentence <= 5 &&
        counts.reading >= 2 &&
        counts.reading <= 5
      );
    },
    { message: 'category distribution out of range [2,5]' },
  );

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type GeneratedQuestion = z.infer<typeof QuestionSchema>;
