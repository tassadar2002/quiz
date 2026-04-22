import Link from 'next/link';

type Title = {
  id: string;
  name: string;
  isLong: boolean;
};

export function TitleList({ items }: { items: Title[] }) {
  if (items.length === 0) return <p className="text-ink-700">这个系列还没有上线内容。</p>;
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.id} className="card">
          <Link href={`/t/${t.id}`} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-primary-700">{t.name}</p>
              {t.isLong && <p className="text-xs text-ink-700">含章节</p>}
            </div>
            <span className="text-ink-700">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
