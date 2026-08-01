import { describe, expect, it } from 'vitest';
import {
  hasAttributionFields,
  parseAttributionParams,
  sanitizeAttributionInput,
} from '@/lib/attribution';

describe('attribution helpers', () => {
  it('parses allowlisted query keys and ignores junk', () => {
    const parsed = parseAttributionParams(
      'utm_source=ph&utm_medium=social&evil=1&ref=producthunt&utm_campaign=',
    );
    expect(parsed).toEqual({
      utm_source: 'ph',
      utm_medium: 'social',
      ref: 'producthunt',
    });
    expect(hasAttributionFields(parsed)).toBe(true);
  });

  it('truncates oversized values', () => {
    const long = 'x'.repeat(250);
    const parsed = parseAttributionParams(`utm_source=${long}`);
    expect(parsed?.utm_source).toHaveLength(200);
  });

  it('sanitizes API attribution payloads', () => {
    const clean = sanitizeAttributionInput({
      utmSource: '  ph  ',
      utmMedium: 'social',
      landingPath: '/blogs/foo',
      rawQuery: { utm_source: 'ph', drop: 'nope' },
      unknown: 'x',
    });
    expect(clean).toMatchObject({
      utmSource: 'ph',
      utmMedium: 'social',
      landingPath: '/blogs/foo',
      rawQuery: { utm_source: 'ph' },
    });
    expect((clean as { unknown?: string }).unknown).toBeUndefined();
  });

  it('rejects empty attribution', () => {
    expect(sanitizeAttributionInput({})).toBeNull();
    expect(sanitizeAttributionInput({ landingPath: '/only' })).toBeNull();
  });
});
