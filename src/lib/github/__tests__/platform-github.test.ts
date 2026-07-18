import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  isPlatformGithubConfigured,
  platformGithubPrivateKeyPem,
  resetServerEnvCache,
  serverEnv,
} from '../../env';
import { resolveGithubAuth } from '../app';
import { signGithubConnectState, verifyGithubConnectState } from '../connect-state';
import {
  githubPlatformInstallCallbackUrl,
  githubPlatformInstallUrl,
} from '../../webhooks/github';

const REQUIRED = {
  DATABASE_URL: 'postgresql://localhost:5432/test',
  JWT_SECRET: 'test-secret-at-least-16-chars',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
};

function setBaseEnv(extra: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries({ ...REQUIRED, ...extra })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetServerEnvCache();
}

describe('platform GitHub env', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    resetServerEnvCache();
  });

  beforeEach(() => {
    setBaseEnv({
      GITHUB_APP_ID: undefined,
      GITHUB_APP_SLUG: undefined,
      GITHUB_APP_WEBHOOK_SECRET: undefined,
      GITHUB_APP_PRIVATE_KEY: undefined,
    });
  });

  it('reports not configured when env is incomplete', () => {
    expect(isPlatformGithubConfigured(serverEnv())).toBe(false);
  });

  it('reports configured when all required vars are set', () => {
    setBaseEnv({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_SLUG: 'peon',
      GITHUB_APP_WEBHOOK_SECRET: 'whsec',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nABC\\n-----END RSA PRIVATE KEY-----',
    });
    expect(isPlatformGithubConfigured(serverEnv())).toBe(true);
    expect(platformGithubPrivateKeyPem(serverEnv())).toContain('BEGIN RSA PRIVATE KEY');
    expect(platformGithubPrivateKeyPem(serverEnv())).toContain('\n');
  });
});

describe('resolveGithubAuth', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    resetServerEnvCache();
  });

  it('uses env PEM for PLATFORM apps', () => {
    setBaseEnv({
      GITHUB_APP_ID: '999',
      GITHUB_APP_SLUG: 'peon',
      GITHUB_APP_WEBHOOK_SECRET: 'whsec',
      GITHUB_APP_PRIVATE_KEY: 'platform-pem',
    });
    const auth = resolveGithubAuth({
      kind: 'PLATFORM',
      status: 'CONNECTED',
      appId: null,
      installationId: '111',
      apiUrl: 'https://api.github.com',
      htmlUrl: 'https://github.com',
      privateKey: null,
    });
    expect(auth.appId).toBe('999');
    expect(auth.installationId).toBe('111');
    expect(auth.privateKey?.privateKey).toBe('platform-pem');
  });

  it('rejects disconnected PLATFORM apps', () => {
    setBaseEnv({
      GITHUB_APP_ID: '999',
      GITHUB_APP_SLUG: 'peon',
      GITHUB_APP_WEBHOOK_SECRET: 'whsec',
      GITHUB_APP_PRIVATE_KEY: 'platform-pem',
    });
    expect(() =>
      resolveGithubAuth({
        kind: 'PLATFORM',
        status: 'DISCONNECTED',
        appId: '999',
        installationId: '111',
        apiUrl: 'https://api.github.com',
        htmlUrl: 'https://github.com',
        privateKey: null,
      }),
    ).toThrow(/disconnected/i);
  });

  it('uses DB private key for CUSTOM apps', () => {
    setBaseEnv();
    const auth = resolveGithubAuth({
      kind: 'CUSTOM',
      status: 'CONNECTED',
      appId: '42',
      installationId: '7',
      apiUrl: 'https://api.github.com',
      htmlUrl: 'https://github.com',
      privateKey: { privateKey: 'custom-pem' },
    });
    expect(auth.appId).toBe('42');
    expect(auth.privateKey?.privateKey).toBe('custom-pem');
  });
});

describe('github connect state', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('round-trips a signed state', () => {
    const state = signGithubConnectState({ workspaceId: 'ws1', userId: 'u1' });
    const payload = verifyGithubConnectState(state);
    expect(payload.workspaceId).toBe('ws1');
    expect(payload.userId).toBe('u1');
  });

  it('rejects tampered state', () => {
    const state = signGithubConnectState({ workspaceId: 'ws1', userId: 'u1' });
    expect(() => verifyGithubConnectState(state + 'x')).toThrow(/invalid/i);
  });
});

describe('platformGithubSourceName', () => {
  it('labels with organization when present', async () => {
    const { platformGithubSourceName } = await import('../app');
    expect(platformGithubSourceName('acme')).toBe('GitHub (Peon): acme');
    expect(platformGithubSourceName(null)).toBe('GitHub (Peon)');
    expect(platformGithubSourceName('  ')).toBe('GitHub (Peon)');
  });
});

describe('platform install URLs', () => {
  it('builds callback and install URLs', () => {
    expect(githubPlatformInstallCallbackUrl('https://app.peon.sh/')).toBe(
      'https://app.peon.sh/api/sources/github/install/callback',
    );
    expect(githubPlatformInstallUrl('peon-dev', 'abc.def')).toBe(
      'https://github.com/apps/peon-dev/installations/new?state=abc.def',
    );
  });
});
