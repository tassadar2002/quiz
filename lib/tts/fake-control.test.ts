import { describe, it, expect } from 'vitest';
import { fakeControl, FakeInjectedError } from './fake-control';

describe('fakeControl', () => {
  it('starts with all knobs at baseline', () => {
    fakeControl.reset();
    expect(fakeControl.ttsFailNextN).toBe(0);
    expect(fakeControl.ttsFailForText.size).toBe(0);
    expect(fakeControl.storageFailNextN).toBe(0);
    expect(fakeControl.storageFailForPath.size).toBe(0);
    expect(fakeControl.calls).toEqual([]);
  });

  it('reset() clears every field after mutation', () => {
    fakeControl.ttsFailNextN = 5;
    fakeControl.ttsFailForText.add('boom');
    fakeControl.storageFailNextN = 3;
    fakeControl.storageFailForPath.add('a/b.mp3');
    fakeControl.calls.push({ kind: 'tts', text: 'logged' });
    fakeControl.reset();
    expect(fakeControl.ttsFailNextN).toBe(0);
    expect(fakeControl.ttsFailForText.size).toBe(0);
    expect(fakeControl.storageFailNextN).toBe(0);
    expect(fakeControl.storageFailForPath.size).toBe(0);
    expect(fakeControl.calls).toEqual([]);
  });
});

describe('FakeInjectedError', () => {
  it('preserves scope and detail in message and exposes name', () => {
    const e = new FakeInjectedError('tts', 'failNextN consumed');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('FakeInjectedError');
    expect(e.message).toBe('fake tts injected failure: failNextN consumed');
  });
});
