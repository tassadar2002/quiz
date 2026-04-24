'use client';
import { useState, useTransition } from 'react';
import { updateQuestion, deleteQuestion } from '@/lib/db/actions/question';
import { regenerateOne } from '@/lib/db/actions/regenerate-one';

type Category = 'vocab' | 'sentence' | 'reading';

type Q = {
  id: string;
  ownerType: 'title' | 'chapter';
  ownerId: string;
  category: Category;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  orderIndex: number;
};

const LETTER = ['A', 'B', 'C'];

export function QuestionReviewList({
  items,
  revalidateHref,
  published = false,
}: {
  items: Q[];
  revalidateHref: string;
  published?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((q) => (
        <QuestionRow
          key={q.id}
          q={q}
          revalidateHref={revalidateHref}
          published={published}
        />
      ))}
    </ul>
  );
}

function QuestionRow({
  q,
  revalidateHref,
  published,
}: {
  q: Q;
  revalidateHref: string;
  published: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [stem, setStem] = useState(q.stem);
  const [options, setOptions] = useState<string[]>(q.options);
  const [correctIndex, setCorrectIndex] = useState(q.correctIndex);
  const [explanation, setExplanation] = useState(q.explanation);
  const [category, setCategory] = useState<Category>(q.category);
  const [error, setError] = useState<string | null>(null);

  const [regenOpen, setRegenOpen] = useState(false);
  const [regenHint, setRegenHint] = useState('');
  const [regenPending, startRegen] = useTransition();

  function regen() {
    setError(null);
    startRegen(async () => {
      const res = await regenerateOne(
        { questionId: q.id, userHint: regenHint || undefined },
        revalidateHref,
      );
      if (!res.ok) {
        setError(res.error);
      } else {
        setRegenOpen(false);
        setRegenHint('');
      }
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateQuestion(
          { id: q.id, stem, options, correctIndex, explanation, category },
          revalidateHref,
        );
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存失败');
      }
    });
  }

  function remove() {
    if (!confirm('删除这道题？')) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteQuestion(q.id, revalidateHref);
      } catch (e) {
        setError(e instanceof Error ? e.message : '删除失败');
      }
    });
  }

  if (editing) {
    return (
      <li className="card space-y-2">
        <select
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          <option value="vocab">vocab</option>
          <option value="sentence">sentence</option>
          <option value="reading">reading</option>
        </select>
        <textarea
          className="input h-20"
          value={stem}
          onChange={(e) => setStem(e.target.value)}
        />
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${q.id}`}
              checked={correctIndex === i}
              onChange={() => setCorrectIndex(i)}
            />
            <span className="w-5 text-ink-700">{LETTER[i]}</span>
            <input
              className="input flex-1"
              value={opt}
              onChange={(e) =>
                setOptions(options.map((o, j) => (i === j ? e.target.value : o)))
              }
            />
          </div>
        ))}
        <textarea
          className="input h-20"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={pending} onClick={save}>
            保存
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)}>
            取消
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs text-ink-700">[{q.category}]</span>
          <p className="font-medium">{q.stem}</p>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost text-xs" onClick={() => setEditing(true)}>
            编辑
          </button>
          <button
            className="btn-ghost text-xs"
            onClick={() => setRegenOpen((o) => !o)}
            disabled={regenPending || published}
            title={
              published ? '已发布的题目无法重新生成，请先撤回发布' : undefined
            }
          >
            {regenOpen ? '取消重生' : '重新生成'}
          </button>
          <button
            className="btn-ghost text-xs text-danger"
            disabled={pending}
            onClick={remove}
          >
            删除
          </button>
        </div>
      </div>
      {regenOpen && (
        <div className="space-y-2 border-t border-ink-200 pt-2">
          <input
            className="input text-sm"
            placeholder='可选提示，如"换个更难的词" / "考察定语从句"'
            value={regenHint}
            onChange={(e) => setRegenHint(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs" disabled={regenPending} onClick={regen}>
              {regenPending ? 'AI 生成中…' : `重新生成（${q.category}）`}
            </button>
            <span className="text-xs text-ink-700">
              将替换这一题，不影响其他 9 题
            </span>
          </div>
        </div>
      )}
      <ul className="ml-2 space-y-1 text-sm">
        {q.options.map((opt, i) => (
          <li key={i} className={i === q.correctIndex ? 'text-success font-medium' : ''}>
            {LETTER[i]} · {opt} {i === q.correctIndex && '✓'}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-700">{q.explanation}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </li>
  );
}
