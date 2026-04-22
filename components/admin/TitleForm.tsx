import { createTitle } from '@/lib/db/actions/title';

export function TitleForm({ seriesId }: { seriesId: string }) {
  return (
    <form action={createTitle} className="card space-y-3">
      <input type="hidden" name="seriesId" value={seriesId} />
      <h2 className="font-semibold">新建书/集</h2>
      <input name="name" required placeholder="书名或剧集名" className="input" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isLong" />
        这是长内容（需要按章节出题）
      </label>
      <button className="btn-primary">创建</button>
    </form>
  );
}
