import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '@/lib/errors';
import {
  parseTokenWebhookPush,
  verifyTokenWebhookSignature,
} from '@/services/internal/webhooks/token-deploy';

function fakeReq(headers: Record<string, string>): {
  headers: { get: (name: string) => string | null };
} {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name) => lower[name.toLowerCase()] ?? null } };
}

describe('token deploy webhook helpers', () => {
  it('parses GitHub-style push payloads', () => {
    expect(
      parseTokenWebhookPush('github', {
        ref: 'refs/heads/main',
        after: 'abc123',
        head_commit: { message: 'ship it' },
      }),
    ).toEqual({ branch: 'main', commitSha: 'abc123', commitMessage: 'ship it' });
  });

  it('verifies GitHub HMAC signatures', () => {
    const token = 'secret-token';
    const rawBody = '{"ref":"refs/heads/main"}';
    const sig =
      'sha256=' + createHmac('sha256', token).update(rawBody).digest('hex');
    expect(() =>
      verifyTokenWebhookSignature('github', token, rawBody, fakeReq({ 'x-hub-signature-256': sig }) as never),
    ).not.toThrow();
    expect(() =>
      verifyTokenWebhookSignature(
        'github',
        token,
        rawBody,
        fakeReq({ 'x-hub-signature-256': 'sha256=deadbeef' }) as never,
      ),
    ).toThrow(UnauthorizedError);
  });

  it('verifies GitLab token header', () => {
    const token = 'gl-secret';
    expect(() =>
      verifyTokenWebhookSignature('gitlab', token, '{}', fakeReq({ 'x-gitlab-token': token }) as never),
    ).not.toThrow();
    expect(() =>
      verifyTokenWebhookSignature('gitlab', token, '{}', fakeReq({ 'x-gitlab-token': 'nope' }) as never),
    ).toThrow(UnauthorizedError);
  });
});
