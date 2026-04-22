import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeriesById, listPublicTitlesInSeries } from '@/lib/db/queries/kid';
import { TitleList } from '@/components/kid/TitleList';

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const s = await getSeriesById(seriesId);
  if (!s) notFound();
  const titles = await listPublicTitlesInSeries(seriesId);
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-primary-700">
        ← 首页
      </Link>
      <h1 className="text-2xl font-bold">{s.title}</h1>
      <TitleList items={titles} />
    </div>
  );
}
