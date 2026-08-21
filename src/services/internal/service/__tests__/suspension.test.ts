import { describe, expect, it } from 'vitest';
import { ConflictError } from '@/lib/errors';
import { assertNotSuspended, isSuspended, SUSPENDED_REASON } from '../suspension';

describe('isSuspended', () => {
  it('treats a null suspendedAt as active', () => {
    expect(isSuspended({ suspendedAt: null })).toBe(false);
  });

  it('treats any timestamp as suspended', () => {
    expect(isSuspended({ suspendedAt: new Date('2026-01-01T00:00:00Z') })).toBe(true);
  });

  // Callers pass partial Prisma selects; an absent column is not a suspension.
  it('treats an unselected column as active', () => {
    expect(isSuspended({})).toBe(false);
  });
});

describe('assertNotSuspended', () => {
  const suspended = { suspendedAt: new Date('2026-01-01T00:00:00Z') };

  it('passes an active service through', () => {
    expect(() => assertNotSuspended({ suspendedAt: null }, 'deploying')).not.toThrow();
  });

  // Every user-facing path answers 409 with the same sentence, differing only in
  // the activity it names.
  it('throws a 409 naming the blocked activity', () => {
    expect(() => assertNotSuspended(suspended, 'rolling back')).toThrow(ConflictError);
    expect(() => assertNotSuspended(suspended, 'rolling back')).toThrow(
      'Service is suspended. Resume it before rolling back.',
    );
    expect(() => assertNotSuspended(suspended, 'you can restart it')).toThrow(
      'Service is suspended. Resume it before you can restart it.',
    );
  });

  it('defaults to the deploy wording', () => {
    expect(() => assertNotSuspended(suspended)).toThrow(
      'Service is suspended. Resume it before deploying.',
    );
  });
});

describe('SUSPENDED_REASON', () => {
  it('is the shared skip reason reported by webhook and preview handlers', () => {
    expect(SUSPENDED_REASON).toBe('service suspended');
  });
});
