'use client';
import { useState, useTransition } from 'react';
import { saveSourceMaterial } from '@/lib/db/actions/source-material';
import { wordCount } from '@/lib/utils/word-count';

export function SourceMaterialEditor({
  ownerType,
  ownerId,
  initialText,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [savedBase, setSavedBase] = useState(initialText);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const words = wordCount(text);
  const tooShort = words < 50 && text.length > 0;
  const tooLong = words > 20_000;
  const dirty = text !== savedBase;

  async function onSave() {
    if (!dirty) return;
    const form = new FormData();
    form.set('ownerType', ownerType);
    form.set('ownerId', ownerId);
    form.set('text', text);
    startTransition(async () => {
      await saveSourceMaterial(form);
      setSavedBase(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">原文（用于 AI 出题）</h3>
        <span className="text-xs text-ink-700">{words} 词</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="input h-64 font-mono text-sm"
        placeholder="把书的原文 / 动画字幕 / 剧情文字 粘贴到这里…"
      />
      {tooShort && <p className="text-xs text-danger">少于 50 词，无法生成题目。</p>}
      {tooLong && (
        <p className="text-xs text-yellow-700">
          超过 20000 词，建议拆章节（仍可继续，但单次成本高）。
        </p>
      )}
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={pending || !dirty} onClick={onSave}>
          {pending ? '保存中…' : dirty ? '保存原文' : '已保存'}
        </button>
        {saved && <span className="text-xs text-success">已保存</span>}
      </div>
    </div>
  );
}
