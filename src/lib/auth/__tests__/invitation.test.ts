import { describe, expect, it } from 'vitest';
import { assertInvitedUser } from '../invitation';

const user = { id: 'user-1', email: 'invitee@example.com' };

describe('assertInvitedUser', () => {
  it('allows the addressed invitee', () => {
    expect(() => assertInvitedUser('invitee@example.com', user)).not.toThrow();
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    expect(() => assertInvitedUser('  Invitee@Example.com ', user)).not.toThrow();
    expect(() =>
      assertInvitedUser('invitee@example.com', { ...user, email: 'INVITEE@example.com' }),
    ).not.toThrow();
  });

  it('rejects a logged-in stranger holding a forwarded token', () => {
    expect(() =>
      assertInvitedUser('invitee@example.com', { id: 'u2', email: 'attacker@evil.test' }),
    ).toThrow(/Sign in as that account/);
  });

  it('rejects rather than passing when the invite has no email', () => {
    expect(() => assertInvitedUser('', user)).toThrow();
    expect(() => assertInvitedUser('   ', user)).toThrow();
  });

  it('does not treat a substring or domain match as the invitee', () => {
    expect(() => assertInvitedUser('invitee@example.com.evil.test', user)).toThrow();
    expect(() => assertInvitedUser('other@example.com', user)).toThrow();
  });

  it('carries a machine-readable code for the UI', () => {
    try {
      assertInvitedUser('invitee@example.com', { id: 'u2', email: 'attacker@evil.test' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toMatchObject({ status: 403, code: 'INVITATION_EMAIL_MISMATCH' });
    }
  });
});
