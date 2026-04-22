'use client';
import { useTransition } from 'react';
import { publishTitle, unpublishTitle } from '@/lib/db/actions/title';
import { publishChapter, unpublishChapter } from '@/lib/db/actions/chapter';

export function PublishButton({
  ownerType,
  ownerId,
  status,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  status: 'draft' | 'published';
}) {
  const [pending, startTransition] = useTransition();

  async function flip() {
    if (status === 'draft') {
      if (!confirm('确认发布？孩子端将可以看到这组题目。')) return;
      startTransition(async () => {
        if (ownerType === 'title') await publishTitle(ownerId);
        else await publishChapter(ownerId);
      });
    } else {
      if (!confirm('撤回发布？孩子端将看不到。')) return;
      startTransition(async () => {
        if (ownerType === 'title') await unpublishTitle(ownerId);
        else await unpublishChapter(ownerId);
      });
    }
  }

  return (
    <button
      className={status === 'published' ? 'btn-ghost' : 'btn-primary'}
      onClick={flip}
      disabled={pending}
    >
      {status === 'published' ? '撤回发布' : '发布这组题'}
    </button>
  );
}
