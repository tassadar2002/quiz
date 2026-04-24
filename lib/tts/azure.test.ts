import { describe, it, expect } from 'vitest';
import { synthesize } from './azure';
import { fakeControl, FakeInjectedError } from './fake-control';

// USE_FAKE_TTS=true is set globally by tests/setup-fakes.ts, so synthesize()
// should delegate to fakeSynthesize. We verify via the call log + injection.
describe('synthesize() dispatch', () => {
  it('delegates to fake when USE_FAKE_TTS=true (logs into fakeControl.calls)', async () => {
    expect(process.env.USE_FAKE_TTS).toBe('true');
    const buf = await synthesize('dispatched');
    expect(buf.toString()).toMatch(/^FAKE_AUDIO:/);
    expect(fakeControl.calls).toContainEqual({ kind: 'tts', text: 'dispatched' });
  });

  it('failure injection on the fake propagates through the dispatcher', async () => {
    fakeControl.ttsFailForText.add('boom');
    await expect(synthesize('boom')).rejects.toThrow(FakeInjectedError);
  });
});
