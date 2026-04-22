'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function GenerateButton({
  ownerType,
  ownerId,
  disabled,
  reviewHref,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  disabled?: boolean;
  reviewHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    setErr(null);
    startTransition(async () => {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId }),
      });
      if (res.ok) {
        router.push(reviewHref);
      } else {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? '生成失败');
      }
    });
  }

  return (
    <div>
      <button className="btn-primary" onClick={onClick} disabled={disabled || pending}>
        {pending ? 'AI 生成中…（约 10–30 秒）' : '生成 10 道题目'}
      </button>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
