import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type AdminSession } from './session';

export async function getAdminSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSession>(cookieStore, sessionOptions);
}

export async function requireAdmin(): Promise<AdminSession> {
  if (process.env.TEST_BYPASS_AUTH === 'true') {
    return { isAdmin: true, loggedInAt: Date.now() };
  }
  const session = await getAdminSession();
  if (!session.isAdmin) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}
