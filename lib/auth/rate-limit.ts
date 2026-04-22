const MAX_FAILURES = 3;
const LOCK_MS = 10 * 60 * 1000;

// NOTE: `count` is only used inside recordFailure to decide when to set
// `lockedUntil`. The gate at checkLoginAttempt only consults `lockedUntil`
// — i.e. past the threshold the lock IS the state. If you ever want an
// additional "warn after N failures" behavior, add an explicit count
// threshold to checkLoginAttempt; do not assume it already considers count.
type Entry = { count: number; firstAt: number; lockedUntil?: number };

const store = new Map<string, Entry>();

export function checkLoginAttempt(ip: string): { allowed: boolean; lockedUntil?: number } {
  const entry = store.get(ip);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { allowed: false, lockedUntil: entry.lockedUntil };
  }
  // Lock expired (or never set) → clear and allow.
  store.delete(ip);
  return { allowed: true };
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = store.get(ip) ?? { count: 0, firstAt: now };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
  }
  store.set(ip, entry);
}

export function recordSuccess(ip: string): void {
  store.delete(ip);
}

export function resetForTest(): void {
  store.clear();
}
