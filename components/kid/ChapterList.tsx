import Link from 'next/link';

type Chapter = {
  id: string;
  name: string;
};

export function ChapterList({ items }: { items: Chapter[] }) {
  if (items.length === 0) return <p className="text-ink-700">尚未上线任何章节。</p>;
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id} className="card">
          <Link href={`/c/${c.id}/quiz`} className="flex items-center justify-between">
            <p className="font-medium text-primary-700">{c.name}</p>
            <span className="text-ink-700">开始 →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
