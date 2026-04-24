import { fakeControl, FakeInjectedError, type StorageOp } from './fake-control';

const store = new Map<string, Buffer>();

export function fakeStorageReset(): void {
  store.clear();
}

export function fakeStorageSnapshot(): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of store) out.set(k, v.length);
  return out;
}

function checkInjection(op: StorageOp, path: string): void {
  fakeControl.calls.push({ kind: 'storage', op, path });
  if (fakeControl.storageFailForPath.has(path)) {
    throw new FakeInjectedError('storage', `${op} ${path}`);
  }
  if (fakeControl.storageFailNextN > 0) {
    fakeControl.storageFailNextN -= 1;
    throw new FakeInjectedError('storage', `failNextN consumed (${op} ${path})`);
  }
}

export function fakePublicUrl(path: string): string {
  checkInjection('publicUrl', path);
  return `fake://${path}`;
}

export async function fakeExists(path: string): Promise<boolean> {
  checkInjection('exists', path);
  return store.has(path);
}

export async function fakeUpload(path: string, buf: Buffer): Promise<void> {
  checkInjection('upload', path);
  store.set(path, buf);
}

export async function fakeRemovePrefix(prefix: string): Promise<void> {
  checkInjection('removePrefix', prefix);
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}/`)) store.delete(key);
  }
}
