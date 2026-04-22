'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginInner() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/admin';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(next);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '登录失败');
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-sm">
      <h1 className="text-2xl font-bold text-primary-700">管理员登录</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="password"
          className="input"
          placeholder="管理员密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-20 max-w-sm">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
