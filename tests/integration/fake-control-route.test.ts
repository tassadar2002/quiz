import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/__fake_control/route';
import { fakeControl } from '@/lib/tts/fake-control';
import { fakeStorageReset, fakeUpload, fakeExists } from '@/lib/tts/storage-fake';

beforeEach(() => {
  fakeControl.reset();
  fakeStorageReset();
});

function jsonReq(body: unknown): Request {
  return new Request('http://test/api/__fake_control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/__fake_control', () => {
  it('GET returns current fake state', async () => {
    fakeControl.ttsFailNextN = 3;
    fakeControl.ttsFailForText.add('boom');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ttsFailNextN).toBe(3);
    expect(body.ttsFailForText).toEqual(['boom']);
    expect(body.callCount).toBe(0);
  });

  it('POST sets ttsFailNextN', async () => {
    const res = await POST(jsonReq({ ttsFailNextN: 5 }));
    expect(res.status).toBe(200);
    expect(fakeControl.ttsFailNextN).toBe(5);
  });

  it('POST sets storageFailForPath as a Set from array', async () => {
    await POST(jsonReq({ storageFailForPath: ['a/b.mp3', 'c.mp3'] }));
    expect(fakeControl.storageFailForPath.has('a/b.mp3')).toBe(true);
    expect(fakeControl.storageFailForPath.has('c.mp3')).toBe(true);
  });

  it('POST {reset:true} clears state AND storage Map', async () => {
    fakeControl.ttsFailNextN = 9;
    await fakeUpload('keep-me.mp3', Buffer.from('x'));
    expect(await fakeExists('keep-me.mp3')).toBe(true);
    const res = await POST(jsonReq({ reset: true }));
    expect(res.status).toBe(200);
    expect(fakeControl.ttsFailNextN).toBe(0);
    expect(await fakeExists('keep-me.mp3')).toBe(false);
  });

  it('returns 404 when neither fake flag is on', async () => {
    const prevTts = process.env.USE_FAKE_TTS;
    const prevStorage = process.env.USE_FAKE_STORAGE;
    process.env.USE_FAKE_TTS = 'false';
    process.env.USE_FAKE_STORAGE = 'false';
    try {
      const res = await GET();
      expect(res.status).toBe(404);
    } finally {
      process.env.USE_FAKE_TTS = prevTts;
      process.env.USE_FAKE_STORAGE = prevStorage;
    }
  });
});
