import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type AdminSession } from '@/lib/auth/session';

const PROTECTED_API = ['/api/generate', '/api/regenerate-one', '/api/upload'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Treat /admin/login, /admin/login/, and /admin/login?... as the public login page.
  const isLoginPage =
    pathname === '/admin/login' || pathname.startsWith('/admin/login/');
  const isAdminPage = pathname.startsWith('/admin') && !isLoginPage;
  const isProtectedApi = PROTECTED_API.some((p) => pathname.startsWith(p));
  if (!isAdminPage && !isProtectedApi) return NextResponse.next();

  const res = NextResponse.next();
  const session = await getIronSession<AdminSession>(req, res, sessionOptions);
  if (!session.isAdmin) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
