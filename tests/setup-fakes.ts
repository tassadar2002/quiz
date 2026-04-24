import { beforeEach } from 'vitest';

// Set env BEFORE any module that reads process.env.USE_FAKE_* is imported.
// vitest.config.ts → test.setupFiles ensures this runs before user test files.
process.env.USE_FAKE_TTS = 'true';
process.env.USE_FAKE_STORAGE = 'true';

beforeEach(async () => {
  const { fakeControl } = await import('@/lib/tts/fake-control');
  const { fakeStorageReset } = await import('@/lib/tts/storage-fake');
  fakeControl.reset();
  fakeStorageReset();
});
