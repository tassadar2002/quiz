import { beforeEach } from 'vitest';

// USE_FAKE_TTS / USE_FAKE_STORAGE / USE_FAKE_AI defaults live in
// vitest.config.ts (env block, via withDefault). They're 'true' by default
// and a shell override like `USE_FAKE_TTS=false pnpm test` still wins.
beforeEach(async () => {
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
  fakeControl.reset();
  fakeStorageReset();
});
