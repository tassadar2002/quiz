import { describe, it, expect } from 'vitest';
import { shuffle, seedShuffle } from './shuffle';

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
  it('seedShuffle is deterministic for same seed', () => {
    const a = seedShuffle([1, 2, 3, 4, 5], 'abc');
    const b = seedShuffle([1, 2, 3, 4, 5], 'abc');
    expect(a).toEqual(b);
  });
  it('seedShuffle differs for different seeds', () => {
    const a = seedShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'aaa');
    const b = seedShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'bbb');
    expect(a).not.toEqual(b);
  });
});
