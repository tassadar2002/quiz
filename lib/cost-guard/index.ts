const OWNER_LOCK_MS = 30_000;
const ownerLocks = new Map<string, number>();
let dailyCount = 0;
let dailyWindowStart = 0;

type Result = { ok: true } | { ok: false; reason: 'owner-locked' | 'daily-cap' };

function getDailyMax(): number {
  const v = Number(process.env.MAX_GENERATIONS_PER_DAY);
  return Number.isFinite(v) && v > 0 ? v : 200;
}

function tickDailyWindow(): void {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (now - dailyWindowStart > dayMs) {
    dailyWindowStart = now;
    dailyCount = 0;
  }
}

export function acquireGenerateSlot(ownerId: string): Result {
  tickDailyWindow();
  const unlockAt = ownerLocks.get(ownerId);
  if (unlockAt && unlockAt > Date.now()) {
    return { ok: false, reason: 'owner-locked' };
  }
  if (dailyCount >= getDailyMax()) {
    return { ok: false, reason: 'daily-cap' };
  }
  ownerLocks.set(ownerId, Date.now() + OWNER_LOCK_MS);
  dailyCount += 1;
  return { ok: true };
}

export function resetForTest(): void {
  ownerLocks.clear();
  dailyCount = 0;
  dailyWindowStart = 0;
}
