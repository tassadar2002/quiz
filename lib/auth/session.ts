import type { SessionOptions } from 'iron-session';

export type AdminSession = {
  isAdmin?: boolean;
  loggedInAt?: number;
};

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 chars');
}

export const sessionOptions: SessionOptions = {
  cookieName: 'quiz_admin',
  password,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
};
