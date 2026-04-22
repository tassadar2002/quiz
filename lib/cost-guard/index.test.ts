import { describe, it, expect, beforeEach, vi } from 'vitest';
import { acquireGenerateSlot, resetForTest } from './index';

describe('cost-guard', () => {
  beforeEach(() => {
    resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    delete process.env.MAX_GENERATIONS_PER_DAY;
  });

  it('allows first generate', () => {
    expect(acquireGenerateSlot('o1').ok).toBe(true);
  });

  it('blocks same owner within 30s', () => {
    acquireGenerateSlot('o1');
    const r = acquireGenerateSlot('o1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('owner-locked');
  });

  it('allows same owner after 30s', () => {
    acquireGenerateSlot('o1');
    vi.setSystemTime(new Date('2026-01-01T00:00:31Z'));
    expect(acquireGenerateSlot('o1').ok).toBe(true);
  });

  it('allows different owner within 30s', () => {
    acquireGenerateSlot('o1');
    expect(acquireGenerateSlot('o2').ok).toBe(true);
  });

  it('enforces daily cap', () => {
    process.env.MAX_GENERATIONS_PER_DAY = '3';
    acquireGenerateSlot('a');
    acquireGenerateSlot('b');
    acquireGenerateSlot('c');
    const r = acquireGenerateSlot('d');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('daily-cap');
  });
});
