import type { GenerateResponse } from './schema';

export function fakeGenerateResponse(): GenerateResponse {
  const mk = (cat: 'vocab' | 'sentence' | 'reading', i: number) => ({
    category: cat,
    stem: `[fake ${cat} #${i}] What does "word${i}" mean?`,
    options: [`option A ${i}`, `option B ${i}`, `option C ${i}`],
    correct_index: i % 3,
    explanation: `这是假题目 ${cat} ${i} 的中文解释。`,
  });
  return {
    questions: [
      mk('vocab', 1),
      mk('vocab', 2),
      mk('vocab', 3),
      mk('sentence', 1),
      mk('sentence', 2),
      mk('sentence', 3),
      mk('reading', 1),
      mk('reading', 2),
      mk('reading', 3),
      mk('reading', 4),
    ],
  };
}
