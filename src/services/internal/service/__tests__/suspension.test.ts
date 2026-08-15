import { describe, expect, it } from 'vitest';
import { SUSPENDED_REASON, isSuspended } from '../suspension';

describe('isSuspended', () => {
  it('treats a null suspendedAt as active', () => {
    expect(isSuspended({ suspendedAt: null })).toBe(false);
  });

  it('treats any timestamp as suspended', () => {
    expect(isSuspended({ suspendedAt: new Date('2026-01-01T00:00:00Z') })).toBe(true);
  });
});

describe('SUSPENDED_REASON', () => {
  it('is the shared skip reason reported by webhook handlers', () => {
    expect(SUSPENDED_REASON).toBe('service suspended');
  });
});
