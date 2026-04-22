import { describe, it, expect } from 'vitest';
import { generateQuestions } from './generate';

describe('generateQuestions (fake mode)', () => {
  it('returns 10 questions with valid distribution when USE_FAKE_AI=true', async () => {
    const result = await generateQuestions(
      'Some source material with at least a few words of content for the AI.',
    );
    expect(result.questions).toHaveLength(10);
    const counts: Record<string, number> = { vocab: 0, sentence: 0, reading: 0 };
    for (const q of result.questions) counts[q.category]++;
    expect(counts.vocab).toBeGreaterThanOrEqual(2);
    expect(counts.sentence).toBeGreaterThanOrEqual(2);
    expect(counts.reading).toBeGreaterThanOrEqual(2);
  });
});
