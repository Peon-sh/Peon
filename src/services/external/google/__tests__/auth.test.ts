import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('axios', () => ({ default: { get } }));

import { normalizeGoogleUser, verifyGoogleToken } from '@/services/external/google/auth';

const CLIENT_ID = 'peon-client.apps.googleusercontent.com';

const PROFILE = {
  id: 'google-sub-1',
  email: 'user@example.com',
  name: 'Real User',
  picture: 'https://example.com/a.png',
};

function mockGoogle(opts: {
  tokeninfo?: Record<string, unknown> | Error;
  userinfo?: Record<string, unknown> | Error;
}) {
  get.mockImplementation(async (url: string) => {
    const source = url.includes('tokeninfo') ? opts.tokeninfo : opts.userinfo;
    if (source instanceof Error) throw source;
    return { data: source ?? {} };
  });
}

describe('verifyGoogleToken', () => {
  beforeEach(() => {
    get.mockReset();
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it('accepts a token minted for this instance', async () => {
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        azp: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: PROFILE,
    });

    const info = await verifyGoogleToken('good-token');

    expect(info.email).toBe(PROFILE.email);
    expect(info.id).toBe('google-sub-1');
    expect(normalizeGoogleUser(info).name).toBe('Real User');
  });

  it('accepts the response shape Google documents for access tokens', async () => {
    mockGoogle({
      tokeninfo: {
        azp: CLIENT_ID,
        aud: CLIENT_ID,
        sub: 'google-sub-1',
        scope: 'openid https://www.googleapis.com/auth/userinfo.email',
        exp: '1744687132',
        expires_in: '3568',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: PROFILE,
    });

    await expect(verifyGoogleToken('good-token')).resolves.toMatchObject({
      email: PROFILE.email,
      id: 'google-sub-1',
    });
  });

  it('accepts a token matching either configured client id', async () => {
    process.env.GOOGLE_CLIENT_ID = 'stale-server-value.apps.googleusercontent.com';
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        azp: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: PROFILE,
    });

    await expect(verifyGoogleToken('good-token')).resolves.toMatchObject({ email: PROFILE.email });
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  });

  it('accepts a token whose azp matches even when aud differs', async () => {
    mockGoogle({
      tokeninfo: {
        aud: 'other-audience',
        azp: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: true,
      },
      userinfo: PROFILE,
    });

    await expect(verifyGoogleToken('good-token')).resolves.toMatchObject({ email: PROFILE.email });
  });

  it('rejects a token minted for a different Google application', async () => {
    mockGoogle({
      tokeninfo: {
        aud: 'attacker-app.apps.googleusercontent.com',
        azp: 'attacker-app.apps.googleusercontent.com',
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: PROFILE,
    });

    await expect(verifyGoogleToken('foreign-token')).rejects.toThrow(
      'Google token was not issued for this application',
    );
  });

  it('rejects an unverified Google email', async () => {
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'false',
      },
      userinfo: PROFILE,
    });

    await expect(verifyGoogleToken('unverified-token')).rejects.toThrow('not verified');
  });

  it('rejects a token with no email scope', async () => {
    mockGoogle({ tokeninfo: { aud: CLIENT_ID, sub: 'google-sub-1', email_verified: 'true' } });

    await expect(verifyGoogleToken('scopeless-token')).rejects.toThrow('missing the email scope');
  });

  it('rejects when tokeninfo itself fails', async () => {
    mockGoogle({ tokeninfo: new Error('400') });

    await expect(verifyGoogleToken('bad-token')).rejects.toThrow('Invalid Google access token');
  });

  it('fails closed when no client id is configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    mockGoogle({
      tokeninfo: { aud: CLIENT_ID, sub: 'x', email: PROFILE.email, email_verified: 'true' },
    });

    await expect(verifyGoogleToken('any-token')).rejects.toThrow('not configured');
    expect(get).not.toHaveBeenCalled();
  });

  it('falls back to NEXT_PUBLIC_GOOGLE_CLIENT_ID', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: PROFILE,
    });

    await expect(verifyGoogleToken('good-token')).resolves.toMatchObject({ email: PROFILE.email });
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  });

  it('rejects a profile whose subject differs from the validated token', async () => {
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: { ...PROFILE, id: 'someone-else' },
    });

    await expect(verifyGoogleToken('swapped-token')).rejects.toThrow('Invalid Google access token');
  });

  it('signs in on the validated email even when the profile fetch fails', async () => {
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: new Error('503'),
    });

    const info = await verifyGoogleToken('good-token');

    expect(info).toMatchObject({ email: PROFILE.email, id: 'google-sub-1' });
    expect(normalizeGoogleUser(info).name).toBe('user');
  });

  it('rejects a token with no resolvable subject', async () => {
    mockGoogle({
      tokeninfo: { aud: CLIENT_ID, email: PROFILE.email, email_verified: 'true' },
      userinfo: new Error('503'),
    });

    await expect(verifyGoogleToken('subjectless-token')).rejects.toThrow(
      'Invalid Google access token',
    );
  });

  it('keeps the validated email over the one userinfo returns', async () => {
    mockGoogle({
      tokeninfo: {
        aud: CLIENT_ID,
        sub: 'google-sub-1',
        email: PROFILE.email,
        email_verified: 'true',
      },
      userinfo: { ...PROFILE, email: 'admin@victim.test' },
    });

    await expect(verifyGoogleToken('good-token')).resolves.toMatchObject({ email: PROFILE.email });
  });
});
