import { describe, expect, it } from 'vitest';
import { availableSlots, shouldRejectQueue } from '../server-queue-guards';

describe('shouldRejectQueue', () => {
  it('rejects when queued count reaches the limit', () => {
    expect(shouldRejectQueue(25, 25)).toBe(true);
    expect(shouldRejectQueue(26, 25)).toBe(true);
  });

  it('allows when under the limit', () => {
    expect(shouldRejectQueue(0, 25)).toBe(false);
    expect(shouldRejectQueue(24, 25)).toBe(false);
  });
});

describe('availableSlots', () => {
  it('returns remaining concurrent build slots', () => {
    expect(availableSlots(2, 0)).toBe(2);
    expect(availableSlots(2, 1)).toBe(1);
    expect(availableSlots(2, 2)).toBe(0);
  });

  it('never goes negative', () => {
    expect(availableSlots(2, 5)).toBe(0);
  });
});
