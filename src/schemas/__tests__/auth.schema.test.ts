import { describe, expect, it } from 'vitest';
import { signupCompleteSchema } from '@/schemas/auth.schema';

const base = {
  email: 'user@peon.test',
  name: 'User',
  password: 'Test1234!',
  code: '123456',
};

describe('signupCompleteSchema attribution', () => {
  it('accepts signup without attribution', () => {
    expect(signupCompleteSchema.safeParse(base).success).toBe(true);
  });

  it('accepts attribution: null (no campaign data)', () => {
    const result = signupCompleteSchema.safeParse({ ...base, attribution: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attribution).toBeNull();
    }
  });

  it('strips empty / null attribution fields', () => {
    const result = signupCompleteSchema.safeParse({
      ...base,
      attribution: {
        utmSource: 'ph',
        utmMedium: '',
        utmCampaign: null,
        landingPath: '/register',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attribution).toMatchObject({
        utmSource: 'ph',
        landingPath: '/register',
      });
      expect(result.data.attribution?.utmMedium).toBeUndefined();
      expect(result.data.attribution?.utmCampaign).toBeUndefined();
    }
  });

  it('accepts a full attribution payload', () => {
    const result = signupCompleteSchema.safeParse({
      ...base,
      attribution: {
        utmSource: 'producthunt',
        utmMedium: 'social',
        capturedAt: '2026-08-01T00:00:00.000Z',
        rawQuery: { utm_source: 'producthunt' },
      },
    });
    expect(result.success).toBe(true);
  });
});
