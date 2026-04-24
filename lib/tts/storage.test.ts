import { describe, it, expect } from 'vitest';
import { publicUrl, exists, upload, removePrefix } from './storage';
import { fakeControl, FakeInjectedError } from './fake-control';

describe('storage dispatch (USE_FAKE_STORAGE=true via setup file)', () => {
  it('publicUrl returns fake:// URL', () => {
    expect(process.env.USE_FAKE_STORAGE).toBe('true');
    expect(publicUrl('a/b.mp3')).toBe('fake://a/b.mp3');
  });

  it('upload + exists round-trip works against fake', async () => {
    await upload('q1/stem.mp3', Buffer.from('hi'));
    expect(await exists('q1/stem.mp3')).toBe(true);
  });

  it('removePrefix removes via fake', async () => {
    await upload('q2/stem.mp3', Buffer.from('a'));
    await upload('q2/option0.mp3', Buffer.from('b'));
    await removePrefix('q2');
    expect(await exists('q2/stem.mp3')).toBe(false);
    expect(await exists('q2/option0.mp3')).toBe(false);
  });

  it('failure injection propagates from fake through dispatcher', async () => {
    fakeControl.storageFailNextN = 1;
    await expect(upload('x.mp3', Buffer.from('z'))).rejects.toThrow(FakeInjectedError);
  });

  it('all four ops appear in the fake call log', async () => {
    publicUrl('a.mp3');
    await exists('a.mp3');
    await upload('a.mp3', Buffer.from('x'));
    await removePrefix('a');
    const ops = fakeControl.calls
      .filter((c) => c.kind === 'storage')
      .map((c) => c.op);
    expect(ops).toEqual(['publicUrl', 'exists', 'upload', 'removePrefix']);
  });
});
