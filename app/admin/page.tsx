import Link from 'next/link';
import { listSeries, deleteSeries } from '@/lib/db/actions/series';
import { SeriesForm } from '@/components/admin/SeriesForm';

export default async function AdminDashboard() {
  const rows = await listSeries();
  return (
    <div className="space-y-6">
      <SeriesForm />
      <section>
        <h2 className="font-semibold mb-3">所有系列</h2>
        {rows.length === 0 ? (
          <p className="text-ink-700">还没有任何系列。</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((s) => (
              <li key={s.id} className="card flex items-center justify-between">
                <div>
                  <Link
                    href={`/admin/series/${s.id}`}
                    className="font-medium text-primary-700 hover:underline"
                  >
                    {s.title}
                  </Link>
                  <span className="ml-2 text-xs text-ink-700">
                    {s.kind === 'book' ? '书籍' : '动画'}
                  </span>
                </div>
                <form
                  action={async () => {
                    'use server';
                    await deleteSeries(s.id);
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
