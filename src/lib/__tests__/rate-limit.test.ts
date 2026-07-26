import { describe, it, expect, beforeEach } from 'vitest';
import { assertRateLimit, clearRateLimitStore } from '../rate-limit';
import { RateLimitError } from '@/lib/errors';

describe('assertRateLimit', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it('allows requests under the limit', () => {
    expect(() => assertRateLimit('t:a', 3, 60_000)).not.toThrow();
    expect(() => assertRateLimit('t:a', 3, 60_000)).not.toThrow();
    expect(() => assertRateLimit('t:a', 3, 60_000)).not.toThrow();
  });

  it('rejects when the limit is exceeded', () => {
    assertRateLimit('t:b', 2, 60_000);
    assertRateLimit('t:b', 2, 60_000);
    expect(() => assertRateLimit('t:b', 2, 60_000)).toThrow(RateLimitError);
  });

  it('isolates keys from each other', () => {
    assertRateLimit('t:c1', 1, 60_000);
    expect(() => assertRateLimit('t:c1', 1, 60_000)).toThrow(RateLimitError);
    expect(() => assertRateLimit('t:c2', 1, 60_000)).not.toThrow();
  });
});
