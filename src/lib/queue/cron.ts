/**
 * Minimal standard 5-field cron matcher: "minute hour day-of-month month day-of-week".
 * Supports "*", step values, ranges "a-b", "a-b/step", and comma-separated lists.
 * Also accepts a few common aliases (@hourly, @daily, @weekly, @monthly, @yearly).
 */

const ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

function matchField(field: string, value: number, min: number, max: number): boolean {
  for (const part of field.split(',')) {
    if (part === '*') return true;
    let range = part;
    let step = 1;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      range = part.slice(0, slash);
      step = parseInt(part.slice(slash + 1), 10) || 1;
    }
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const dash = range.indexOf('-');
      if (dash !== -1) {
        lo = parseInt(range.slice(0, dash), 10);
        hi = parseInt(range.slice(dash + 1), 10);
      } else {
        lo = hi = parseInt(range, 10);
      }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    if (value < lo || value > hi) continue;
    if ((value - lo) % step === 0) return true;
  }
  return false;
}

/** Returns true when `expr` fires at the given time (evaluated at minute granularity). */
export function cronMatches(expr: string, date: Date = new Date()): boolean {
  const normalized = ALIASES[expr.trim()] ?? expr.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) return false;
  const [min, hour, dom, mon, dow] = fields;
  const dowValue = date.getDay(); // 0-6, Sun=0
  return (
    matchField(min, date.getMinutes(), 0, 59) &&
    matchField(hour, date.getHours(), 0, 23) &&
    matchField(dom, date.getDate(), 1, 31) &&
    matchField(mon, date.getMonth() + 1, 1, 12) &&
    // cron allows Sunday as both 0 and 7
    (matchField(dow, dowValue, 0, 6) || (dowValue === 0 && matchField(dow, 7, 0, 7)))
  );
}
