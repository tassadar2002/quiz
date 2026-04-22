import { describe, it, expect } from 'vitest';
import { shuffle } from './shuffle';

describe('shuffle', () => {
  it('keeps the same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const s = shuffle(arr);
    expect(s.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(s.length).toBe(5);
  });
  it('does not mutate input', () => {
    const arr = [1, 2, 3];
    shuffle(arr);
    expect(arr).toEqual([1, 2, 3]);
  });
});
