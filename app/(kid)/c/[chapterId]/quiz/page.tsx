import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicChapter, getQuestionsForOwner } from '@/lib/db/queries/kid';
import { QuizRunner } from '@/components/kid/QuizRunner';

export default async function ChapterQuiz({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId } = await params;
  const c = await getPublicChapter(chapterId);
  if (!c) notFound();
  const qs = await getQuestionsForOwner('chapter', chapterId);
  return (
    <div className="space-y-4">
      <Link href={`/t/${c.titleId}`} className="text-sm text-primary-700">
        ← 返回
      </Link>
      <h1 className="text-xl font-bold">{c.name}</h1>
      <QuizRunner
        ownerType="chapter"
        ownerId={chapterId}
        questions={qs.map((q) => ({
          id: q.id,
          stem: q.stem,
          options: q.options as string[],
          category: q.category,
        }))}
      />
    </div>
  );
}
