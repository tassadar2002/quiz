import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicTitle, listPublicChapters } from '@/lib/db/queries/kid';
import { ChapterList } from '@/components/kid/ChapterList';

export default async function TitlePage({
  params,
}: {
  params: Promise<{ titleId: string }>;
}) {
  const { titleId } = await params;
  const t = await getPublicTitle(titleId);
  if (!t) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/s/${t.seriesId}`} className="text-sm text-primary-700">
        ← 系列
      </Link>
      <h1 className="text-2xl font-bold">{t.name}</h1>
      {t.isLong ? (
        <>
          <p className="text-ink-700">按章节练习：</p>
          <ChapterList items={await listPublicChapters(t.id)} />
        </>
      ) : (
        <div className="card">
          <Link className="btn-primary" href={`/t/${t.id}/quiz`}>
            开始 Quiz
          </Link>
        </div>
      )}
    </div>
  );
}
