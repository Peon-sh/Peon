import { describe, expect, it } from 'vitest';
import { formatLocalDateTime, parseApiDate } from '@/lib/datetime';

describe('parseApiDate', () => {
  it('keeps explicit Z / offsets', () => {
    expect(parseApiDate('2026-07-22T02:46:00.000Z')?.toISOString()).toBe(
      '2026-07-22T02:46:00.000Z',
    );
    expect(parseApiDate('2026-07-22T08:16:00.000+05:30')?.toISOString()).toBe(
      '2026-07-22T02:46:00.000Z',
    );
  });

  it('treats timezone-less SQL / ISO strings as UTC', () => {
    expect(parseApiDate('2026-07-22 02:46:00')?.toISOString()).toBe('2026-07-22T02:46:00.000Z');
    expect(parseApiDate('2026-07-22T02:46:00.000')?.toISOString()).toBe(
      '2026-07-22T02:46:00.000Z',
    );
  });

  it('returns null for invalid input', () => {
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate('not-a-date')).toBeNull();
  });
});

describe('formatLocalDateTime', () => {
  it('formats in the runtime local timezone', () => {
    const label = formatLocalDateTime('2026-07-22T02:46:00.000Z', 'datetime', 'en-GB');
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/22/);
  });
});
