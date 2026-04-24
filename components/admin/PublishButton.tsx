'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unpublishTitle } from '@/lib/db/actions/title';
import { unpublishChapter } from '@/lib/db/actions/chapter';

type Phase = 'idle' | 'publishing' | 'unpublishing';

export function PublishButton({
  ownerType,
  ownerId,
  status,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  status: 'draft' | 'published';
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [pendingTransition, startTransition] = useTransition();
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    generated: number;
    cached: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function publish() {
    if (!confirm('确认发布？将为每道题预生成 4 个语音文件，可能需 10-60 秒。')) {
      return;
    }
    setErr(null);
    setProgress(null);
    setPhase('publishing');

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId }),
      });
      if (!res.ok && !res.body) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? `发布失败 (${res.status})`);
        setPhase('idle');
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setErr('浏览器不支持流式响应');
        setPhase('idle');
        return;
      }
      const decoder = new TextDecoder();
      let buffer = '';
      let success = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n\n');
        while (idx !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          idx = buffer.indexOf('\n\n');
          if (!raw.startsWith('data: ')) continue;
          const ev = JSON.parse(raw.slice(6));
          if (ev.type === 'start') {
            setProgress({ done: 0, total: ev.total, generated: 0, cached: 0 });
          } else if (ev.type === 'progress') {
            setProgress({
              done: ev.done,
              total: ev.total,
              generated: ev.generated,
              cached: ev.cached,
            });
          } else if (ev.type === 'done') {
            success = true;
          } else if (ev.type === 'error') {
            setErr(ev.message);
          }
        }
      }
      if (success) {
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '网络错误');
    } finally {
      setPhase('idle');
    }
  }

  async function unpublish() {
    if (!confirm('撤回发布？孩子端将看不到。')) return;
    setErr(null);
    setPhase('unpublishing');
    startTransition(async () => {
      try {
        if (ownerType === 'title') await unpublishTitle(ownerId);
        else await unpublishChapter(ownerId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '撤回失败');
      } finally {
        setPhase('idle');
      }
    });
  }

  const busy = phase !== 'idle' || pendingTransition;

  return (
    <div className="space-y-2">
      <button
        className={status === 'published' ? 'btn-ghost' : 'btn-primary'}
        onClick={status === 'published' ? unpublish : publish}
        disabled={busy}
      >
        {status === 'published'
          ? phase === 'unpublishing'
            ? '撤回中…'
            : '撤回发布'
          : phase === 'publishing'
            ? '发布中…'
            : '发布这组题'}
      </button>
      {phase === 'publishing' && progress && (
        <p className="text-sm text-ink-700">
          正在生成语音 {progress.done} / {progress.total}
          {progress.cached > 0 && (
            <span className="ml-2 text-xs text-ink-500">
              （已缓存 {progress.cached}，新生成 {progress.generated}）
            </span>
          )}
        </p>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
