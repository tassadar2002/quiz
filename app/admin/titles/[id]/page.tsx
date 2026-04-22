import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTitle } from '@/lib/db/actions/title';
import { listChapters, deleteChapter } from '@/lib/db/actions/chapter';
import { ChapterForm } from '@/components/admin/ChapterForm';

export default async function TitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTitle(id);
  if (!t) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/admin/series/${t.seriesId}`} className="text-sm text-primary-700">
        ← 返回系列
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{t.name}</h1>
        <p className="text-sm text-ink-700">
          {t.isLong
            ? '长内容：按章节管理'
            : '短内容：原文与题目将在 Task 13/17 接入'}
          · {t.status === 'published' ? '已发布' : '草稿'}
        </p>
      </header>

      {t.isLong ? (
        <>
          <ChapterForm titleId={t.id} />
          <section>
            <h2 className="font-semibold mb-3">章节</h2>
            <ChapterListServer titleId={t.id} />
          </section>
        </>
      ) : (
        <section className="card">
          <p className="text-ink-700">短内容的原文编辑器将在下一个任务接入。</p>
        </section>
      )}
    </div>
  );
}

async function ChapterListServer({ titleId }: { titleId: string }) {
  const rows = await listChapters(titleId);
  if (rows.length === 0) return <p className="text-ink-700">还没有章节。</p>;
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="card flex items-center justify-between">
          <div>
            <Link
              href={`/admin/chapters/${c.id}`}
              className="font-medium text-primary-700 hover:underline"
            >
              {c.name}
            </Link>
            <span
              className={`ml-2 text-xs ${
                c.status === 'published' ? 'text-success' : 'text-ink-700'
              }`}
            >
              {c.status === 'published' ? '已发布' : '草稿'}
            </span>
          </div>
          <form
            action={async () => {
              'use server';
              await deleteChapter(c.id, titleId);
            }}
          >
            <button className="btn-ghost text-sm text-danger">删除</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
