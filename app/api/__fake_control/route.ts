import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

function isFakeMode(): boolean {
  return (
    process.env.USE_FAKE_TTS === 'true' ||
    process.env.USE_FAKE_STORAGE === 'true'
  );
}

export async function GET(): Promise<Response> {
  if (!isFakeMode()) return new NextResponse(null, { status: 404 });
  const { fakeControl } = await import('@/lib/tts/fake-control');
  return NextResponse.json({
    ttsFailNextN: fakeControl.ttsFailNextN,
    ttsFailForText: [...fakeControl.ttsFailForText],
    storageFailNextN: fakeControl.storageFailNextN,
    storageFailForPath: [...fakeControl.storageFailForPath],
    callCount: fakeControl.calls.length,
    calls: fakeControl.calls.slice(-50),
  });
}

export async function POST(req: NextRequest | Request): Promise<Response> {
  if (!isFakeMode()) return new NextResponse(null, { status: 404 });
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.reset === true) {
    fakeControl.reset();
    const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
    fakeStorageReset();
    return NextResponse.json({ ok: true });
  }
  if (typeof body.ttsFailNextN === 'number') {
    fakeControl.ttsFailNextN = body.ttsFailNextN;
  }
  if (Array.isArray(body.ttsFailForText)) {
    fakeControl.ttsFailForText = new Set(body.ttsFailForText as string[]);
  }
  if (typeof body.storageFailNextN === 'number') {
    fakeControl.storageFailNextN = body.storageFailNextN;
  }
  if (Array.isArray(body.storageFailForPath)) {
    fakeControl.storageFailForPath = new Set(body.storageFailForPath as string[]);
  }
  return NextResponse.json({ ok: true });
}
