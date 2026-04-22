import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkLoginAttempt, recordFailure, recordSuccess, resetForTest } from './rate-limit';

describe('login rate limit', () => {
  beforeEach(() => {
    resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('allows first attempts (before threshold)', () => {
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
    recordFailure('1.2.3.4');
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
    recordFailure('1.2.3.4');
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
  });

  it('locks after 3 consecutive failures', () => {
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    const res = checkLoginAttempt('1.2.3.4');
    expect(res.allowed).toBe(false);
    expect(res.lockedUntil).toBeDefined();
  });

  it('unlocks after 10 minutes', () => {
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'));
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
  });

  it('tracks ips independently', () => {
    recordFailure('1.1.1.1');
    recordFailure('1.1.1.1');
    recordFailure('1.1.1.1');
    expect(checkLoginAttempt('2.2.2.2').allowed).toBe(true);
  });

  it('recordSuccess resets the counter', () => {
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    recordSuccess('1.2.3.4');
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
  });
});
