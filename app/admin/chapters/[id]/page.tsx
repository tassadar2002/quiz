import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getChapter } from '@/lib/db/actions/chapter';

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getChapter(id);
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <Link href={`/admin/titles/${c.titleId}`} className="text-sm text-primary-700">
        ← 返回 Title
      </Link>
      <h1 className="text-2xl font-bold">{c.name}</h1>
      <p className="text-ink-700">原文编辑器与题目管理将在后续任务接入。</p>
    </div>
  );
}
