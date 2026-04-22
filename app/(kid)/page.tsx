import { listPublicSeries } from '@/lib/db/queries/kid';
import { SeriesGrid } from '@/components/kid/SeriesGrid';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const all = await listPublicSeries();
  const books = all.filter((s) => s.kind === 'book');
  const animations = all.filter((s) => s.kind === 'animation');
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl font-bold">📚 书籍</h2>
        <SeriesGrid items={books} />
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">🎬 动画</h2>
        <SeriesGrid items={animations} />
      </section>
    </div>
  );
}
