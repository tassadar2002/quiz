export default function Home() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold text-primary-700">英文 Quiz</h1>
      <p className="mt-2 text-ink-700">主题色已配置，下面是控件示例：</p>
      <div className="mt-4 flex gap-3">
        <button className="btn-primary">主要按钮</button>
        <button className="btn-ghost">次要按钮</button>
      </div>
      <div className="card mt-4">卡片容器示例</div>
    </div>
  );
}
