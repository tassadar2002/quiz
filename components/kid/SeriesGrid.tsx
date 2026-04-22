import Link from 'next/link';

type Series = {
  id: string;
  title: string;
  kind: 'book' | 'animation';
  coverUrl: string | null;
};

export function SeriesGrid({ items }: { items: Series[] }) {
  if (items.length === 0) return <p className="text-ink-700">还没有上线的内容。</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((s) => (
        <Link
          key={s.id}
          href={`/s/${s.id}`}
          className="card flex flex-col gap-2 hover:border-primary-500"
        >
          <div className="flex aspect-[3/4] items-center justify-center rounded-[var(--radius-card)] bg-primary-50 text-3xl">
            {s.kind === 'book' ? '📚' : '🎬'}
          </div>
          <div className="text-sm font-semibold">{s.title}</div>
        </Link>
      ))}
    </div>
  );
}
