import { createSeries } from '@/lib/db/actions/series';

export function SeriesForm() {
  return (
    <form action={createSeries} className="card space-y-3">
      <h2 className="font-semibold">新建系列</h2>
      <div className="flex gap-3">
        <select name="kind" className="input !w-28 shrink-0" defaultValue="book">
          <option value="book">书籍</option>
          <option value="animation">动画</option>
        </select>
        <input name="title" required placeholder="系列名称" className="input flex-1" />
      </div>
      <textarea name="description" placeholder="简介（可选）" className="input h-20" />
      <button className="btn-primary">创建</button>
    </form>
  );
}
