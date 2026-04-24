import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTitle } from '@/lib/db/actions/title';
import { listQuestions } from '@/lib/db/actions/question';
import { parseOptions } from '@/lib/db/question-helpers';
import { QuestionReviewList } from '@/components/admin/QuestionReviewList';
import { PublishButton } from '@/components/admin/PublishButton';

export default async function TitleReview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTitle(id);
  if (!t) notFound();
  const rows = await listQuestions('title', id);
  const href = `/admin/titles/${id}/review`;
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
      <Link href={`/admin/titles/${id}`} className="text-sm text-primary-700">
        ← 返回 title
      </Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审核题目 · {t.name}</h1>
        <PublishButton ownerType="title" ownerId={id} status={t.status} />
      </header>
      {items.length === 0 ? (
        <p className="text-ink-700">还没有生成题目。</p>
      ) : (
        <QuestionReviewList
          items={items}
          revalidateHref={href}
          published={t.status === 'published'}
        />
      )}
    </div>
  );
}
