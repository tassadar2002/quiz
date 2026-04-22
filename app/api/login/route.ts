import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSession } from '@/lib/auth/guard';
import { checkLoginAttempt, recordFailure, recordSuccess } from '@/lib/auth/rate-limit';

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const gate = checkLoginAttempt(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: '登录尝试过多，请 10 分钟后再试' },
      { status: 429 },
    );
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  if (password !== process.env.ADMIN_PASSWORD) {
    recordFailure(ip);
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }

  recordSuccess(ip);
  const session = await getAdminSession();
  session.isAdmin = true;
  session.loggedInAt = Date.now();
  await session.save();
  return NextResponse.json({ ok: true });
}
