import { createHash } from 'node:crypto';
import { fakeControl, FakeInjectedError } from './fake-control';

export async function fakeSynthesize(text: string): Promise<Buffer> {
  fakeControl.calls.push({ kind: 'tts', text });

  if (fakeControl.ttsFailForText.has(text)) {
    throw new FakeInjectedError('tts', `text="${text.slice(0, 40)}"`);
  }
  if (fakeControl.ttsFailNextN > 0) {
    fakeControl.ttsFailNextN -= 1;
    throw new FakeInjectedError('tts', 'failNextN consumed');
  }

  const tag = createHash('sha1').update(text).digest('hex').slice(0, 8);
  return Buffer.from(`FAKE_AUDIO:${tag}`);
}
