import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getChapter } from '@/lib/db/actions/chapter';
import { listQuestions } from '@/lib/db/actions/question';
import { parseOptions } from '@/lib/db/question-helpers';
import { QuestionReviewList } from '@/components/admin/QuestionReviewList';
import { PublishButton } from '@/components/admin/PublishButton';

export default async function ChapterReview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getChapter(id);
  if (!c) notFound();
  const rows = await listQuestions('chapter', id);
  const href = `/admin/chapters/${id}/review`;
  const items = rows.map((q) => ({
    id: q.id,
    ownerType: q.ownerType as 'title' | 'chapter',
    ownerId: q.ownerId,
    category: q.category,
    stem: q.stem,
    options: parseOptions(q.options),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    orderIndex: q.orderIndex,
  }));
  return (
    <div className="space-y-6">
      <Link href={`/admin/chapters/${id}`} className="text-sm text-primary-700">
        ← 返回章节
      </Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审核题目 · {c.name}</h1>
        <PublishButton ownerType="chapter" ownerId={id} status={c.status} />
      </header>
      {items.length === 0 ? (
        <p className="text-ink-700">还没有生成题目。</p>
      ) : (
        <QuestionReviewList
          items={items}
          revalidateHref={href}
          published={c.status === 'published'}
        />
      )}
    </div>
  );
}
