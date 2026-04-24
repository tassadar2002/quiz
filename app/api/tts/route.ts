import { NextResponse, type NextRequest } from 'next/server';
import { exists, publicUrl } from '@/lib/tts/storage';

export const runtime = 'nodejs';

type Field = 'stem' | 'option0' | 'option1' | 'option2';
const FIELDS: readonly Field[] = ['stem', 'option0', 'option1', 'option2'];

function isField(s: string | null): s is Field {
  return s !== null && (FIELDS as readonly string[]).includes(s);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lookup-only. Audio is pre-generated at publish time; this route never calls
// Azure. A 404 means the admin hasn't (re-)published since the question was
// created or regenerated.
export async function GET(req: NextRequest) {
  const qid = req.nextUrl.searchParams.get('qid');
  const key = req.nextUrl.searchParams.get('key');
  if (!qid || !UUID_RE.test(qid)) {
    return NextResponse.json({ error: 'invalid qid' }, { status: 400 });
  }
  if (!isField(key)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }
  const path = `${qid}/${key}.mp3`;
  if (!(await exists(path))) {
    return NextResponse.json({ error: 'not generated' }, { status: 404 });
  }
  return NextResponse.json({ url: publicUrl(path) });
}
