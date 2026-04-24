'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function GenerateButton({
  ownerType,
  ownerId,
  disabled,
  reviewHref,
  published = false,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  disabled?: boolean;
  reviewHref: string;
  published?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const router = useRouter();
  const preRef = useRef<HTMLPreElement | null>(null);

  async function onClick() {
    setErr(null);
    setStreamText('');
    setCount(null);
    setRunning(true);

    let errored = false;
    let done = false;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? `生成失败 (${res.status})`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setErr('浏览器不支持流式响应');
        return;
      }
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n\n');
        while (idx !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          idx = buffer.indexOf('\n\n');
          if (!raw.startsWith('data: ')) continue;
          const payload = JSON.parse(raw.slice(6));
          if (payload.type === 'chunk') {
            setStreamText((prev) => prev + payload.text);
            // auto-scroll preview to bottom
            requestAnimationFrame(() => {
              if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
            });
          } else if (payload.type === 'done') {
            done = true;
            setCount(payload.count);
          } else if (payload.type === 'error') {
            errored = true;
            setErr(payload.message);
          }
        }
      }
    } catch (e) {
      errored = true;
      setErr(e instanceof Error ? e.message : '网络错误');
    } finally {
      setRunning(false);
    }

    if (done && !errored) {
      // refresh() purges the client Router Cache so the subsequent push
      // fetches the review page's RSC payload fresh. Without it, a recently
      // visited review route may be served from cache with stale question
      // ids (the ones we just DELETE'd), and inline edits on those rows
      // silently no-op.
      router.refresh();
      setTimeout(() => router.push(reviewHref), 600);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          onClick={onClick}
          disabled={disabled || running || published}
          title={published ? '已发布的题目无法重新生成，请先撤回发布' : undefined}
        >
          {running ? 'AI 生成中…' : '生成 10 道题目'}
        </button>
        {published && (
          <span className="text-sm text-ink-700">
            已发布 — 如需重新生成，请到「审核题目」页点击「撤回发布」
          </span>
        )}
        {count !== null && !err && (
          <span className="text-sm text-success">✓ 生成 {count} 道题，即将跳转…</span>
        )}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {(running || streamText) && (
        <div>
          <p className="mb-1 text-xs text-ink-700">AI 输出（实时流式）：</p>
          <pre
            ref={preRef}
            className="card max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs"
          >
            {streamText || '等待首个响应…'}
          </pre>
        </div>
      )}
    </div>
  );
}
