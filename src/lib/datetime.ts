/**
 * Date helpers for API timestamps stored as UTC in Postgres (`TIMESTAMP(3)`).
 * Always format for the viewer's local timezone in the browser.
 */

const HAS_TZ = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

/** Parse an API date, treating timezone-less values as UTC. */
export function parseApiDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = value.trim();
  if (!raw) return null;

  // "2026-07-22 02:46:00[.sss]" or "2026-07-22T02:46:00[.sss]" without offset → UTC
  const normalized = (() => {
    if (HAS_TZ.test(raw)) return raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
      return `${raw.replace(' ', 'T')}Z`;
    }
    return raw;
  })();

  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type LocalDateTimeStyle = 'date' | 'time' | 'datetime' | 'datetime-tz';

const STYLE_OPTIONS: Record<LocalDateTimeStyle, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'medium' },
  time: { timeStyle: 'short' },
  datetime: { dateStyle: 'medium', timeStyle: 'short' },
  'datetime-tz': { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' },
};

/** Format a UTC API timestamp in the viewer's local timezone. */
export function formatLocalDateTime(
  value: string | number | Date | null | undefined,
  style: LocalDateTimeStyle = 'datetime',
  locale?: string,
): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, STYLE_OPTIONS[style]).format(date);
}
