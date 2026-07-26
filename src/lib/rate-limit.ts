import { RateLimitError } from '@/lib/errors';

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

const MAX_KEYS = 10_000;

function prune(timestamps: number[], windowStart: number): number[] {
  let i = 0;
  while (i < timestamps.length && timestamps[i]! < windowStart) i += 1;
  return i === 0 ? timestamps : timestamps.slice(i);
}

function evictIfNeeded(): void {
  if (buckets.size <= MAX_KEYS) return;
  const excess = buckets.size - MAX_KEYS;
  const keys = buckets.keys();
  for (let i = 0; i < excess; i += 1) {
    const next = keys.next();
    if (next.done) break;
    buckets.delete(next.value);
  }
}

export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = buckets.get(key);
  const timestamps = prune(existing?.timestamps ?? [], windowStart);

  if (timestamps.length >= limit) {
    buckets.set(key, { timestamps });
    throw new RateLimitError();
  }

  timestamps.push(now);
  buckets.set(key, { timestamps });
  evictIfNeeded();
}

export function clearRateLimitStore(): void {
  buckets.clear();
}
