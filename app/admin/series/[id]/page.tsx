import Link from 'next/link';
import { listTitles, deleteTitle } from '@/lib/db/actions/title';
import { TitleForm } from '@/components/admin/TitleForm';

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const titles = await listTitles(id);
  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-primary-700">
        ← 返回 Dashboard
      </Link>
      <TitleForm seriesId={id} />
      <section>
        <h2 className="font-semibold mb-3">书/集列表</h2>
        {titles.length === 0 ? (
          <p className="text-ink-700">还没有书/集。</p>
        ) : (
          <ul className="space-y-2">
            {titles.map((t) => (
              <li key={t.id} className="card flex items-center justify-between">
                <div>
                  <Link
                    href={`/admin/titles/${t.id}`}
                    className="font-medium text-primary-700 hover:underline"
                  >
                    {t.name}
                  </Link>
                  <span className="ml-2 text-xs text-ink-700">
                    {t.isLong ? '长内容(章节)' : '短内容'}
                  </span>
                  <span
                    className={`ml-2 text-xs ${
                      t.status === 'published' ? 'text-success' : 'text-ink-700'
                    }`}
                  >
                    {t.status === 'published' ? '已发布' : '草稿'}
                  </span>
                </div>
                <form
                  action={async () => {
                    'use server';
                    await deleteTitle(t.id, id);
                  }}
                >
                  <button className="btn-ghost text-sm text-danger">删除</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
