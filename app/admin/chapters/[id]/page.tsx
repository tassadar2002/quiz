import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getChapter } from '@/lib/db/actions/chapter';
import { getSourceMaterial } from '@/lib/db/actions/source-material';
import { SourceMaterialEditor } from '@/components/admin/SourceMaterialEditor';
import { GenerateButton } from '@/components/admin/GenerateButton';

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getChapter(id);
  if (!c) notFound();
  const sm = await getSourceMaterial('chapter', id);
  return (
    <div className="space-y-6">
      <Link href={`/admin/titles/${c.titleId}`} className="text-sm text-primary-700">
        ← 返回 Title
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <p className="text-sm text-ink-700">
          · {c.status === 'published' ? '已发布' : '草稿'}
        </p>
      </header>
      <SourceMaterialEditor
        ownerType="chapter"
        ownerId={id}
        initialText={sm?.text ?? ''}
      />
      <div className="flex items-center gap-3">
        <GenerateButton
          ownerType="chapter"
          ownerId={id}
          reviewHref={`/admin/chapters/${id}/review`}
        />
        <a
          href={`/admin/chapters/${id}/review`}
          className="text-sm text-primary-700 hover:underline"
        >
          查看已有题目 →
        </a>
      </div>
    </div>
  );
}
