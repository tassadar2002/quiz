import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { detectKind, parseFile, SIZE_LIMITS } from '@/lib/parsers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PARSE_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '无法读取上传文件' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少 file 字段' }, { status: 400 });
  }

  const name = file.name;
  const buf = Buffer.from(await file.arrayBuffer());

  const kind = detectKind(name, buf);
  if (!kind) {
    return NextResponse.json(
      { error: '不支持的文件类型；仅支持 PDF / EPUB / SRT（通过扩展名 + 魔数双重校验）' },
      { status: 400 },
    );
  }

  const limit = SIZE_LIMITS[kind];
  if (buf.length > limit) {
    return NextResponse.json(
      { error: `文件过大（${kind} 限 ${Math.round(limit / 1024 / 1024)}MB）` },
      { status: 413 },
    );
  }

  try {
    const result = await withTimeout(parseFile(buf, kind), PARSE_TIMEOUT_MS, 'parse');
    return NextResponse.json({
      filename: name,
      kind,
      text: result.text,
      chapters: result.chapters ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('upload parse failed', err);
    return NextResponse.json({ error: `解析失败: ${msg}` }, { status: 500 });
  }
}
