import Link from 'next/link';

export default function ResultFallback() {
  return (
    <div className="card text-center">
      <p className="mb-2">没有可展示的结果。</p>
      <Link href="/" className="btn-primary">
        回首页开始练习
      </Link>
    </div>
  );
}
