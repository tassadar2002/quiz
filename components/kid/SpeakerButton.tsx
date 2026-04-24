'use client';
import { useRef, useState } from 'react';

let currentAudio: HTMLAudioElement | null = null;

type Field = 'stem' | 'option0' | 'option1' | 'option2';

export function SpeakerButton({
  questionId,
  field,
  size = 'md',
  ariaLabel,
}: {
  questionId: string;
  field: Field;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  // 'missing' = audio not generated yet (admin hasn't republished). Disable
  // permanently for this question/field — re-clicking won't help until next
  // page load.
  const [state, setState] = useState<
    'idle' | 'loading' | 'playing' | 'error' | 'missing'
  >('idle');
  const cachedUrl = useRef<string | null>(null);

  async function play() {
    if (state === 'missing') return;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    let url = cachedUrl.current;
    if (!url) {
      setState('loading');
      try {
        const res = await fetch(`/api/tts?qid=${questionId}&key=${field}`);
        if (res.status === 404) {
          setState('missing');
          return;
        }
        if (!res.ok) throw new Error('tts api failed');
        const data = (await res.json()) as { url: string };
        url = data.url;
        cachedUrl.current = url;
      } catch {
        setState('error');
        setTimeout(() => setState('idle'), 1500);
        return;
      }
    }
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => setState('idle');
    audio.onerror = () => setState('error');
    setState('playing');
    audio.play().catch(() => setState('error'));
  }

  const px = size === 'sm' ? 'h-7 w-7 text-base' : 'h-8 w-8 text-lg';
  const icon =
    state === 'loading'
      ? '…'
      : state === 'error'
        ? '!'
        : state === 'missing'
          ? '🔇'
          : '🔊';
  const title = state === 'missing' ? '语音尚未生成' : undefined;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void play();
      }}
      disabled={state === 'loading' || state === 'missing'}
      title={title}
      aria-label={ariaLabel ?? '播放语音'}
      className={`${px} inline-flex items-center justify-center rounded-full border border-ink-300 bg-white hover:border-primary-500 hover:text-primary-700 disabled:opacity-50`}
    >
      {icon}
    </button>
  );
}
