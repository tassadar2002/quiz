import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicTitle, getQuestionsForOwner } from '@/lib/db/queries/kid';
import { QuizRunner } from '@/components/kid/QuizRunner';

export default async function TitleQuiz({
  params,
}: {
  params: Promise<{ titleId: string }>;
}) {
  const { titleId } = await params;
  const t = await getPublicTitle(titleId);
  if (!t || t.isLong) notFound();
  const qs = await getQuestionsForOwner('title', titleId);
  return (
    <div className="space-y-4">
      <Link href={`/t/${titleId}`} className="text-sm text-primary-700">
        ← 返回
      </Link>
      <h1 className="text-xl font-bold">{t.name}</h1>
      <QuizRunner
        questions={qs.map((q) => ({
          id: q.id,
          stem: q.stem,
          options: q.options as string[],
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          category: q.category,
        }))}
      />
    </div>
  );
}
