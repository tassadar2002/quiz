'use client';
import { useRef, useState, useTransition } from 'react';
import { saveSourceMaterial } from '@/lib/db/actions/source-material';
import { wordCount } from '@/lib/utils/word-count';

type Tab = 'paste' | 'upload';
type Chapter = { id: string; title: string; text: string };

export function SourceMaterialEditor({
  ownerType,
  ownerId,
  initialText,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  initialText: string;
}) {
  const [tab, setTab] = useState<Tab>('paste');
  const [text, setText] = useState(initialText);
  const [savedBase, setSavedBase] = useState(initialText);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Upload state
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [uploadedFullText, setUploadedFullText] = useState<string>('');
  const [uploadedName, setUploadedName] = useState<string>('');

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

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploadErr(null);
    setUploading(true);
    setChapters(null);
    setUploadedFullText('');
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) {
        setUploadErr(json.error ?? `上传失败 (${res.status})`);
        return;
      }
      setUploadedName(json.filename ?? '');
      setUploadedFullText(json.text ?? '');
      if (json.chapters && json.chapters.length > 0) {
        setChapters(json.chapters as Chapter[]);
      } else {
        // No chapter list — load the extracted text directly
        setText(json.text ?? '');
        setTab('paste');
      }
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : '网络错误');
    } finally {
      setUploading(false);
    }
  }

  function useChapter(c: Chapter) {
    setText(c.text);
    setChapters(null);
    setUploadedFullText('');
    setTab('paste');
  }

  function useFullBook() {
    setText(uploadedFullText);
    setChapters(null);
    setUploadedFullText('');
    setTab('paste');
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">原文（用于 AI 出题）</h3>
        <div className="flex gap-1 text-xs">
          <button
            className={
              tab === 'paste'
                ? 'rounded-[var(--radius-card)] bg-primary-600 px-3 py-1 text-white'
                : 'rounded-[var(--radius-card)] border border-ink-200 bg-white px-3 py-1 text-ink-700 hover:bg-ink-100'
            }
            onClick={() => setTab('paste')}
          >
            粘贴文本
          </button>
          <button
            className={
              tab === 'upload'
                ? 'rounded-[var(--radius-card)] bg-primary-600 px-3 py-1 text-white'
                : 'rounded-[var(--radius-card)] border border-ink-200 bg-white px-3 py-1 text-ink-700 hover:bg-ink-100'
            }
            onClick={() => setTab('upload')}
          >
            上传文件
          </button>
        </div>
      </div>

      {tab === 'paste' ? (
        <>
          <div className="flex items-center justify-between">
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
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-ink-700">
            支持：PDF / EPUB（≤ 20 MB）、SRT 字幕（≤ 2 MB）
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.epub,.srt"
            className="block w-full text-sm"
            disabled={uploading}
          />
          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={onUpload} disabled={uploading}>
              {uploading ? '解析中…' : '上传并解析'}
            </button>
            {uploadedName && !chapters && (
              <span className="text-xs text-ink-700">{uploadedName}</span>
            )}
          </div>
          {uploadErr && <p className="text-sm text-danger">{uploadErr}</p>}

          {chapters && (
            <div className="space-y-2">
              <p className="text-sm">
                检测到 {chapters.length} 个章节（{uploadedName}）。选一个：
              </p>
              <button className="btn-ghost text-xs" onClick={useFullBook}>
                使用整本（{wordCount(uploadedFullText)} 词）
              </button>
              <ul className="max-h-64 space-y-1 overflow-auto border border-ink-200 p-2 text-sm">
                {chapters.map((c) => (
                  <li key={c.id}>
                    <button
                      className="w-full text-left hover:bg-ink-100 rounded px-2 py-1"
                      onClick={() => useChapter(c)}
                    >
                      <span className="font-medium">{c.title}</span>{' '}
                      <span className="text-xs text-ink-700">
                        ({wordCount(c.text)} 词)
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
