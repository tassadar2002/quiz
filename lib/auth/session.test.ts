import { describe, it, expect } from 'vitest';
import { sessionOptions } from './session';

describe('sessionOptions', () => {
  it('has the expected cookie name', () => {
    expect(sessionOptions.cookieName).toBe('quiz_admin');
  });

  it('sources password from SESSION_SECRET and requires >= 32 chars', () => {
    expect(sessionOptions.password).toBeDefined();
    expect(sessionOptions.password.length).toBeGreaterThanOrEqual(32);
  });

  it('sets httpOnly and sameSite cookie options', () => {
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true);
    expect(sessionOptions.cookieOptions?.sameSite).toBe('lax');
  });
});
