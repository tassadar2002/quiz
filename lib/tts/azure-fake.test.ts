import { describe, it, expect, beforeEach } from 'vitest';
import { fakeSynthesize } from './azure-fake';
import { fakeControl, FakeInjectedError } from './fake-control';

beforeEach(() => fakeControl.reset());

describe('fakeSynthesize', () => {
  it('returns deterministic Buffer for the same text', async () => {
    const a = await fakeSynthesize('hello world');
    const b = await fakeSynthesize('hello world');
    expect(Buffer.isBuffer(a)).toBe(true);
    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toMatch(/^FAKE_AUDIO:[a-f0-9]{8}$/);
  });

  it('returns different Buffer for different text', async () => {
    const a = await fakeSynthesize('one');
    const b = await fakeSynthesize('two');
    expect(a.toString()).not.toBe(b.toString());
  });

  it('logs each call into fakeControl.calls', async () => {
    await fakeSynthesize('one');
    await fakeSynthesize('two');
    expect(fakeControl.calls).toEqual([
      { kind: 'tts', text: 'one' },
      { kind: 'tts', text: 'two' },
    ]);
  });

  it('throws FakeInjectedError when ttsFailNextN > 0 and decrements counter', async () => {
    fakeControl.ttsFailNextN = 2;
    await expect(fakeSynthesize('a')).rejects.toThrow(FakeInjectedError);
    await expect(fakeSynthesize('b')).rejects.toThrow(FakeInjectedError);
    expect(fakeControl.ttsFailNextN).toBe(0);
    // Next call after counter exhausted should succeed.
    await expect(fakeSynthesize('c')).resolves.toBeInstanceOf(Buffer);
  });

  it('throws FakeInjectedError when text is in ttsFailForText', async () => {
    fakeControl.ttsFailForText.add('boom');
    await expect(fakeSynthesize('boom')).rejects.toThrow(FakeInjectedError);
    await expect(fakeSynthesize('safe')).resolves.toBeInstanceOf(Buffer);
  });

  it('still logs the call when failure is injected', async () => {
    fakeControl.ttsFailForText.add('logged');
    await expect(fakeSynthesize('logged')).rejects.toThrow();
    expect(fakeControl.calls).toEqual([{ kind: 'tts', text: 'logged' }]);
  });
});
