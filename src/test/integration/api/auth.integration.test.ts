import { describe, expect, it } from 'vitest';
import { createUser, loginAs, plantOtp } from '@/test/integration/fixtures';
import { clearCookies, http } from '@/test/integration/http';
import { prisma } from '@/lib/prisma';

describe('authentication API', () => {
  it('initiates and completes signup with an OTP', async () => {
    const email = `signup-${crypto.randomUUID()}@peon.test`;
    expect((await http.post('/api/auth/signup', { body: { email } })).status).toBe(200);
    await plantOtp(email, 'SIGNUP');

    const result = await http.post('/api/auth/verify-signup', {
      body: { email, name: 'New User', password: 'Test1234!', code: '123456' },
    });

    expect(result.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { email } })).toMatchObject({ name: 'New User' });
  });

  it('persists first-touch attribution once on signup', async () => {
    const email = `attr-${crypto.randomUUID()}@peon.test`;
    expect((await http.post('/api/auth/signup', { body: { email } })).status).toBe(200);
    await plantOtp(email, 'SIGNUP');

    const result = await http.post('/api/auth/verify-signup', {
      body: {
        email,
        name: 'Attr User',
        password: 'Test1234!',
        code: '123456',
        attribution: {
          utmSource: 'producthunt',
          utmMedium: 'social',
          utmCampaign: 'launch',
          ref: 'ph',
          landingPath: '/',
          capturedAt: '2026-08-01T00:00:00.000Z',
          rawQuery: { utm_source: 'producthunt', ref: 'ph' },
        },
      },
    });

    expect(result.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.userAttribution.findUnique({ where: { userId: user.id } });
    expect(row).toMatchObject({
      utmSource: 'producthunt',
      utmMedium: 'social',
      utmCampaign: 'launch',
      ref: 'ph',
      landingPath: '/',
    });
  });

  it('rejects invalid signup and login input', async () => {
    expect((await http.post('/api/auth/signup', { body: { email: 'bad' } })).status).toBe(422);
    expect((await http.post('/api/auth/login', { body: { email: 'bad', password: '' } })).status).toBe(422);
  });

  it('logs in with a password and rejects incorrect credentials', async () => {
    const user = await createUser({ password: 'Test1234!' });
    expect(
      (await http.post('/api/auth/login', { body: { email: user.email, password: 'Test1234!' } })).status,
    ).toBe(200);
    clearCookies();
    expect(
      (await http.post('/api/auth/login', { body: { email: user.email, password: 'wrong' } })).status,
    ).toBe(401);
  });

  it('verifies a mocked Google identity and rejects a bad token', async () => {
    expect((await http.post('/api/auth/google/verify', { body: { accessToken: 'valid' } })).status).toBe(200);
    clearCookies();
    expect(
      (await http.post('/api/auth/google/verify', { body: { accessToken: 'invalid' } })).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it('returns me, updates profile, onboards, changes password, and logs out', async () => {
    const user = await createUser({ isOnboarded: false });
    await loginAs(user);

    expect((await http.get('/api/auth/me')).status).toBe(200);
    expect((await http.patch('/api/auth/profile', { body: { name: 'Updated' } })).status).toBe(200);
    expect((await http.post('/api/auth/onboarding')).status).toBe(200);
    expect(
      (
        await http.post('/api/auth/profile/password', {
          body: { currentPassword: 'Test1234!', newPassword: 'Changed1234!' },
        })
      ).status,
    ).toBe(200);
    expect((await http.post('/api/auth/logout')).status).toBe(200);
    expect((await http.get('/api/auth/me')).status).toBe(401);
  });

  it('resets a forgotten password with an OTP', async () => {
    const user = await createUser();
    expect((await http.post('/api/auth/forgot-password', { body: { email: user.email } })).status).toBe(200);
    await plantOtp(user.email, 'RESET_PASSWORD');
    expect(
      (
        await http.post('/api/auth/reset-password', {
          body: { email: user.email, code: '123456', newPassword: 'Reset1234!' },
        })
      ).status,
    ).toBe(200);
  });

  it('resends a signup OTP', async () => {
    const email = `resend-${crypto.randomUUID()}@peon.test`;
    expect((await http.post('/api/auth/signup', { body: { email } })).status).toBe(200);
    expect(
      (await http.post('/api/auth/resend-otp', { body: { email, purpose: 'SIGNUP' } })).status,
    ).toBe(200);
  });

  it('presigns, confirms, and removes an avatar', async () => {
    const user = await createUser();
    await loginAs(user);

    const presign = await http.post('/api/auth/profile/avatar/presign', {
      body: { contentType: 'image/png' },
    });
    expect(presign.status).toBe(200);
    const key = presign.body.data.key as string;
    expect(key).toContain(`users/${user.id}/avatar.`);

    expect((await http.post('/api/auth/profile/avatar/confirm', { body: { key } })).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      profilePicture: key,
    });

    expect((await http.delete('/api/auth/profile/avatar')).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      profilePicture: null,
    });
  });

  it('lists and revokes sessions', async () => {
    const user = await createUser();
    await loginAs(user);
    const current = await prisma.authSession.findFirstOrThrow({ where: { userId: user.id } });
    const other = await prisma.authSession.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    expect((await http.get('/api/auth/sessions')).status).toBe(200);
    expect((await http.delete(`/api/auth/sessions/${other.id}`)).status).toBe(200);
    expect((await http.post('/api/auth/sessions/revoke-others')).status).toBe(200);
    expect(await prisma.authSession.findUnique({ where: { id: current.id } })).not.toBeNull();
    expect((await http.post('/api/auth/sessions/revoke-all')).status).toBe(200);
  });

  it.each([
    ['me', 'GET', '/api/auth/me'],
    ['profile', 'PATCH', '/api/auth/profile'],
    ['sessions', 'GET', '/api/auth/sessions'],
  ])('returns 401 for unauthenticated %s', async (_name, method, path) => {
    clearCookies();
    const result =
      method === 'PATCH' ? await http.patch(path, { body: { name: 'X' } }) : await http.get(path);
    expect(result.status).toBe(401);
  });
});
