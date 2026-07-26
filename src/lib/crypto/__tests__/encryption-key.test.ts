import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  decrypt,
  decryptWithSource,
  encrypt,
  encryptionKeyStatus,
  isValidEncryptionKey,
  resetEncryptionKeyCache,
} from '../encryption';

const STRICT_KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_STRICT_KEY = Buffer.alloc(32, 9).toString('base64');
const LEGACY_KEY = 'some-arbitrary-passphrase';

function useKeys(current: string, previous?: string): void {
  process.env.ENCRYPTION_KEY = current;
  if (previous === undefined) delete process.env.ENCRYPTION_KEY_PREVIOUS;
  else process.env.ENCRYPTION_KEY_PREVIOUS = previous;
  resetEncryptionKeyCache();
}

describe('encryption key modes', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
    resetEncryptionKeyCache();
  });

  describe('isValidEncryptionKey', () => {
    it('accepts a 32-byte base64 key', () => {
      expect(isValidEncryptionKey(STRICT_KEY)).toBe(true);
    });

    it('rejects short, empty, absent and 16-byte values', () => {
      expect(isValidEncryptionKey('secret')).toBe(false);
      expect(isValidEncryptionKey('')).toBe(false);
      expect(isValidEncryptionKey(undefined)).toBe(false);
      expect(isValidEncryptionKey(null)).toBe(false);
      expect(isValidEncryptionKey(Buffer.alloc(16, 1).toString('base64'))).toBe(false);
    });
  });

  describe('encryptionKeyStatus', () => {
    it('reports strict mode for a proper key', () => {
      useKeys(STRICT_KEY);
      expect(encryptionKeyStatus()).toEqual({
        mode: 'strict',
        hasPreviousKey: false,
        isPlaceholder: false,
      });
    });

    it('reports legacy-derived mode for an arbitrary key', () => {
      useKeys(LEGACY_KEY);
      expect(encryptionKeyStatus().mode).toBe('legacy-derived');
    });

    it('flags the .env.example placeholder', () => {
      useKeys('change-me-32-byte-base64-key');
      expect(encryptionKeyStatus().isPlaceholder).toBe(true);
    });

    it('reports when a previous key is configured', () => {
      useKeys(STRICT_KEY, LEGACY_KEY);
      expect(encryptionKeyStatus().hasPreviousKey).toBe(true);
    });
  });

  describe('legacy compatibility — the upgrade path must not lose data', () => {
    it('still round-trips with an arbitrary legacy key', () => {
      useKeys(LEGACY_KEY);
      expect(decrypt(encrypt('ssh-private-key'))).toBe('ssh-private-key');
    });

    it('decrypts data written by the pre-upgrade SHA-256 behaviour', () => {
      // Written by an old Peon install.
      useKeys(LEGACY_KEY);
      const legacyCiphertext = encrypt('db-password');

      // Same key after upgrading: must still be readable.
      resetEncryptionKeyCache();
      expect(decrypt(legacyCiphertext)).toBe('db-password');
    });

    it('never throws merely because the key is weak', () => {
      useKeys('x');
      expect(() => encrypt('value')).not.toThrow();
    });

    it('throws only when no key is configured at all', () => {
      delete process.env.ENCRYPTION_KEY;
      resetEncryptionKeyCache();
      expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY is not set/);
    });
  });

  describe('rotation via ENCRYPTION_KEY_PREVIOUS', () => {
    it('decrypts legacy data after switching to a strict key', () => {
      useKeys(LEGACY_KEY);
      const old = encrypt('llm-api-key');

      useKeys(STRICT_KEY, LEGACY_KEY);
      expect(decrypt(old)).toBe('llm-api-key');
    });

    it('encrypts new values under the current key only', () => {
      useKeys(STRICT_KEY, LEGACY_KEY);
      const fresh = encrypt('new-secret');

      // Readable with the current key alone, once the previous one is dropped.
      useKeys(STRICT_KEY);
      expect(decrypt(fresh)).toBe('new-secret');
    });

    it('reports which key decrypted a value', () => {
      useKeys(LEGACY_KEY);
      const old = encrypt('old-value');

      useKeys(STRICT_KEY, LEGACY_KEY);
      expect(decryptWithSource(old)).toEqual({ value: 'old-value', source: 'previous' });
      expect(decryptWithSource(encrypt('new-value'))).toEqual({
        value: 'new-value',
        source: 'current',
      });
    });

    it('fails once the previous key is removed and data was not rotated', () => {
      useKeys(LEGACY_KEY);
      const unrotated = encrypt('forgotten');

      // Operator dropped ENCRYPTION_KEY_PREVIOUS too early.
      useKeys(STRICT_KEY);
      expect(() => decrypt(unrotated)).toThrow();
    });

    it('surfaces the current-key error, not the previous-key error', () => {
      useKeys(STRICT_KEY, OTHER_STRICT_KEY);
      expect(() => decrypt('aaaa.bbbb.cccc')).toThrow();
    });

    it('rejects malformed payloads before trying any key', () => {
      useKeys(STRICT_KEY, LEGACY_KEY);
      expect(() => decrypt('not-encrypted')).toThrow('Invalid encrypted payload');
      expect(() => decrypt('only.two')).toThrow('Invalid encrypted payload');
      expect(() => decryptWithSource('only.two')).toThrow('Invalid encrypted payload');
    });

    it('round-trips an empty string through rotation', () => {
      useKeys(LEGACY_KEY);
      const empty = encrypt('');
      useKeys(STRICT_KEY, LEGACY_KEY);
      expect(decrypt(empty)).toBe('');
    });
  });
});
