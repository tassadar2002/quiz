import { describe, it, expect, beforeEach } from 'vitest';
import {
  fakePublicUrl,
  fakeExists,
  fakeUpload,
  fakeRemovePrefix,
  fakeStorageReset,
  fakeStorageSnapshot,
} from './storage-fake';
import { fakeControl, FakeInjectedError } from './fake-control';

beforeEach(() => {
  fakeControl.reset();
  fakeStorageReset();
});

describe('fake storage — happy path', () => {
  it('publicUrl returns fake:// scheme', () => {
    expect(fakePublicUrl('q1/stem.mp3')).toBe('fake://q1/stem.mp3');
  });

  it('upload then exists returns true; non-existent path returns false', async () => {
    await fakeUpload('q1/stem.mp3', Buffer.from('x'));
    expect(await fakeExists('q1/stem.mp3')).toBe(true);
    expect(await fakeExists('q1/option0.mp3')).toBe(false);
  });

  it('removePrefix removes all paths with the prefix and only those', async () => {
    await fakeUpload('q1/stem.mp3', Buffer.from('x'));
    await fakeUpload('q1/option0.mp3', Buffer.from('y'));
    await fakeUpload('q2/stem.mp3', Buffer.from('z'));
    await fakeRemovePrefix('q1');
    expect(await fakeExists('q1/stem.mp3')).toBe(false);
    expect(await fakeExists('q1/option0.mp3')).toBe(false);
    expect(await fakeExists('q2/stem.mp3')).toBe(true);
  });

  it('snapshot returns path → byte length', async () => {
    await fakeUpload('a.mp3', Buffer.from('hello'));
    const snap = fakeStorageSnapshot();
    expect(snap.get('a.mp3')).toBe(5);
  });

  it('logs each storage op into fakeControl.calls', async () => {
    await fakeUpload('q1/stem.mp3', Buffer.from('x'));
    await fakeExists('q1/stem.mp3');
    fakePublicUrl('q1/stem.mp3');
    await fakeRemovePrefix('q1');
    expect(fakeControl.calls).toEqual([
      { kind: 'storage', op: 'upload', path: 'q1/stem.mp3' },
      { kind: 'storage', op: 'exists', path: 'q1/stem.mp3' },
      { kind: 'storage', op: 'publicUrl', path: 'q1/stem.mp3' },
      { kind: 'storage', op: 'removePrefix', path: 'q1' },
    ]);
  });
});

describe('fake storage — failure injection', () => {
  it('storageFailNextN throws on next op then resumes', async () => {
    fakeControl.storageFailNextN = 1;
    await expect(fakeUpload('a.mp3', Buffer.from('x'))).rejects.toThrow(FakeInjectedError);
    expect(fakeControl.storageFailNextN).toBe(0);
    await fakeUpload('b.mp3', Buffer.from('y'));
    expect(await fakeExists('b.mp3')).toBe(true);
  });

  it('storageFailForPath throws only on matching path', async () => {
    fakeControl.storageFailForPath.add('forbidden.mp3');
    await expect(fakeUpload('forbidden.mp3', Buffer.from('x'))).rejects.toThrow(FakeInjectedError);
    await fakeUpload('allowed.mp3', Buffer.from('y'));
    expect(await fakeExists('allowed.mp3')).toBe(true);
  });

  it('fakeStorageReset clears the in-memory Map', async () => {
    await fakeUpload('a.mp3', Buffer.from('x'));
    fakeStorageReset();
    expect(await fakeExists('a.mp3')).toBe(false);
  });
});
