import { describe, it, expect } from 'vitest';
import { isStaleSshChannelError, sshTargetIdentity } from '../pool';
import type { SshTarget } from '../types';

describe('isStaleSshChannelError', () => {
  it('matches channel open failures from half-open sessions', () => {
    expect(isStaleSshChannelError(new Error('(SSH) Channel open failure: open failed'))).toBe(true);
    expect(isStaleSshChannelError(new Error('Not connected'))).toBe(true);
    expect(isStaleSshChannelError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isStaleSshChannelError(new Error('Image build failed'))).toBe(false);
    expect(isStaleSshChannelError(new Error('Permission denied'))).toBe(false);
  });
});

describe('sshTargetIdentity', () => {
  const base: SshTarget = {
    id: 'srv_1',
    host: '10.0.0.1',
    port: 22,
    username: 'root',
    privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  };

  it('changes when host, port, user, or key change', () => {
    const a = sshTargetIdentity(base);
    expect(sshTargetIdentity({ ...base, host: '10.0.0.2' })).not.toBe(a);
    expect(sshTargetIdentity({ ...base, port: 2222 })).not.toBe(a);
    expect(sshTargetIdentity({ ...base, username: 'ubuntu' })).not.toBe(a);
    expect(sshTargetIdentity({ ...base, privateKey: base.privateKey + '\n' })).not.toBe(a);
    expect(sshTargetIdentity({ ...base })).toBe(a);
  });
});
