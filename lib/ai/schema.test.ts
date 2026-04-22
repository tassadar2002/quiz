import { describe, it, expect } from 'vitest';
import { GenerateResponseSchema } from './schema';

function makeQuestions(dist: { vocab: number; sentence: number; reading: number }) {
  const mk = (cat: 'vocab' | 'sentence' | 'reading') => ({
    category: cat,
    stem: 'A valid stem',
    options: ['a', 'b', 'c'],
    correct_index: 0,
    explanation: 'explanation 中文.',
  });
  const arr: ReturnType<typeof mk>[] = [];
  for (let i = 0; i < dist.vocab; i++) arr.push(mk('vocab'));
  for (let i = 0; i < dist.sentence; i++) arr.push(mk('sentence'));
  for (let i = 0; i < dist.reading; i++) arr.push(mk('reading'));
  return { questions: arr };
}

describe('GenerateResponseSchema', () => {
  it('accepts 3/3/4', () => {
    expect(() =>
      GenerateResponseSchema.parse(makeQuestions({ vocab: 3, sentence: 3, reading: 4 })),
    ).not.toThrow();
  });
  it('accepts 4/3/3', () => {
    expect(() =>
      GenerateResponseSchema.parse(makeQuestions({ vocab: 4, sentence: 3, reading: 3 })),
    ).not.toThrow();
  });
  it('accepts 2/3/5 (edge)', () => {
    expect(() =>
      GenerateResponseSchema.parse(makeQuestions({ vocab: 2, sentence: 3, reading: 5 })),
    ).not.toThrow();
  });
  it('rejects 1/4/5 (too few vocab)', () => {
    expect(() =>
      GenerateResponseSchema.parse(makeQuestions({ vocab: 1, sentence: 4, reading: 5 })),
    ).toThrow();
  });
  it('rejects 6/2/2 (too many vocab)', () => {
    expect(() =>
      GenerateResponseSchema.parse(makeQuestions({ vocab: 6, sentence: 2, reading: 2 })),
    ).toThrow();
  });
  it('rejects if total != 10', () => {
    expect(() =>
      GenerateResponseSchema.parse(makeQuestions({ vocab: 3, sentence: 3, reading: 3 })),
    ).toThrow();
  });
  it('rejects option count != 3', () => {
    const bad = makeQuestions({ vocab: 3, sentence: 3, reading: 4 });
    bad.questions[0].options = ['a', 'b'];
    expect(() => GenerateResponseSchema.parse(bad)).toThrow();
  });
  it('rejects correct_index out of range', () => {
    const bad = makeQuestions({ vocab: 3, sentence: 3, reading: 4 });
    bad.questions[0].correct_index = 3;
    expect(() => GenerateResponseSchema.parse(bad)).toThrow();
  });
});
