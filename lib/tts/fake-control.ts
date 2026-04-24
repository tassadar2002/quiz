export class FakeInjectedError extends Error {
  constructor(scope: 'tts' | 'storage', detail: string) {
    super(`fake ${scope} injected failure: ${detail}`);
    this.name = 'FakeInjectedError';
  }
}

export type StorageOp = 'exists' | 'upload' | 'removePrefix' | 'publicUrl';

export type CallLogEntry =
  | { kind: 'tts'; text: string }
  | { kind: 'storage'; op: StorageOp; path: string };

export const fakeControl = {
  ttsFailNextN: 0,
  ttsFailForText: new Set<string>(),
  storageFailNextN: 0,
  storageFailForPath: new Set<string>(),
  calls: [] as CallLogEntry[],

  reset() {
    this.ttsFailNextN = 0;
    this.ttsFailForText.clear();
    this.storageFailNextN = 0;
    this.storageFailForPath.clear();
    this.calls.length = 0;
    // Storage fake's in-memory Map is reset separately by fakeStorageReset()
    // (lives in storage-fake.ts to avoid circular import). The vitest setup
    // file calls both.
  },
};
