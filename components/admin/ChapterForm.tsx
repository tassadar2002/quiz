import { createChapter } from '@/lib/db/actions/chapter';

export function ChapterForm({ titleId }: { titleId: string }) {
  return (
    <form action={createChapter} className="card space-y-3">
      <input type="hidden" name="titleId" value={titleId} />
      <h3 className="font-semibold">新建章节</h3>
      <input
        name="name"
        required
        placeholder="章节名，如 Chapter 1: Into the Woods"
        className="input"
      />
      <button className="btn-primary">创建</button>
    </form>
  );
}
