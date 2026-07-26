import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetServerEnvCache, serverEnv } from '../env';

const VALID_KEY = Buffer.alloc(32, 3).toString('base64');

function baseEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/peon?schema=public',
    JWT_SECRET: 'a-real-secret-at-least-16-chars',
    ENCRYPTION_KEY: VALID_KEY,
  };
}

describe('serverEnv secret hardening', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    for (const key of [
      'DATABASE_URL',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
      'ENCRYPTION_KEY_PREVIOUS',
      'NODE_ENV',
    ]) {
      delete process.env[key];
    }
    Object.assign(process.env, baseEnv());
  });

  afterEach(() => {
    process.env = { ...snapshot };
    resetServerEnvCache();
  });

  describe('JWT_SECRET', () => {
    it('rejects the .env.example placeholder in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'change-me-long-random-string';
      expect(() => serverEnv()).toThrow(/JWT_SECRET is still the .env.example placeholder/);
    });

    it('names the generator command', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'change-me-long-random-string';
      expect(() => serverEnv()).toThrow(/openssl rand -hex 32/);
    });

    it('tolerates the placeholder outside production', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'change-me-long-random-string';
      expect(() => serverEnv()).not.toThrow();
    });
  });

  describe('ENCRYPTION_KEY', () => {
    // Format is NOT validated here on purpose. serverEnv() is synchronous and
    // cannot tell a new installation from an upgrade of an existing one, and
    // refusing a legacy key would make already-encrypted data unreadable.
    // lib/crypto/preflight.ts owns that decision.

    it('accepts a legacy key in production so upgrades do not brick', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENCRYPTION_KEY = 'arbitrary-legacy-passphrase';
      expect(() => serverEnv()).not.toThrow();
    });

    it('accepts the placeholder in production (preflight warns instead)', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENCRYPTION_KEY = 'change-me-32-byte-base64-key';
      expect(() => serverEnv()).not.toThrow();
    });

    it('still requires the variable to be present', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ENCRYPTION_KEY;
      expect(() => serverEnv()).toThrow(/ENCRYPTION_KEY is required/);
    });

    it('exposes ENCRYPTION_KEY_PREVIOUS for rotation', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENCRYPTION_KEY_PREVIOUS = 'old-key';
      expect(serverEnv().ENCRYPTION_KEY_PREVIOUS).toBe('old-key');
    });

    it('leaves ENCRYPTION_KEY_PREVIOUS undefined when unset', () => {
      expect(serverEnv().ENCRYPTION_KEY_PREVIOUS).toBeUndefined();
    });
  });

  it('accepts a fully configured production environment', () => {
    process.env.NODE_ENV = 'production';
    expect(() => serverEnv()).not.toThrow();
  });
});
