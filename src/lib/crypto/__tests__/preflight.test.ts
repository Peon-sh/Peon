import { afterEach, describe, expect, it } from 'vitest';
import { checkEncryptionKey } from '../preflight';
import { resetEncryptionKeyCache } from '../encryption';

const STRICT_KEY = Buffer.alloc(32, 5).toString('base64');
const LEGACY_KEY = 'arbitrary-passphrase-from-2024';
const PLACEHOLDER = 'change-me-32-byte-base64-key';

function useKey(raw: string): void {
  process.env.ENCRYPTION_KEY = raw;
  resetEncryptionKeyCache();
}

const freshDb = () => Promise.resolve(0);
const existingDb = () => Promise.resolve(12);
const brokenDb = () => Promise.reject(new Error('ECONNREFUSED'));

describe('encryption key preflight', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
    resetEncryptionKeyCache();
  });

  describe('strict key', () => {
    it('passes on a fresh install', async () => {
      useKey(STRICT_KEY);
      await expect(checkEncryptionKey(freshDb)).resolves.toEqual({ ok: true, level: 'ok' });
    });

    it('passes on an existing install', async () => {
      useKey(STRICT_KEY);
      await expect(checkEncryptionKey(existingDb)).resolves.toEqual({ ok: true, level: 'ok' });
    });

    it('does not touch the database at all', async () => {
      useKey(STRICT_KEY);
      let called = false;
      await checkEncryptionKey(async () => {
        called = true;
        return 0;
      });
      expect(called).toBe(false);
    });
  });

  describe('legacy key', () => {
    it('REFUSES on a fresh install so new setups start correct', async () => {
      useKey(LEGACY_KEY);
      const result = await checkEncryptionKey(freshDb);
      expect(result.ok).toBe(false);
      expect(result.level).toBe('error');
      expect(result.ok === false && result.message).toMatch(/NEW installation/);
    });

    it('ALLOWS an existing install — upgrading must never brick it', async () => {
      useKey(LEGACY_KEY);
      const result = await checkEncryptionKey(existingDb);
      expect(result.ok).toBe(true);
      expect(result.level).toBe('warn');
    });

    it('warns prominently and explains the rotation path', async () => {
      useKey(LEGACY_KEY);
      const result = await checkEncryptionKey(existingDb);
      const message = result.level === 'warn' ? result.message : '';
      expect(message).toMatch(/DEPRECATED ENCRYPTION KEY/);
      expect(message).toMatch(/ENCRYPTION_KEY_PREVIOUS/);
      expect(message).toMatch(/encryption:rotate/);
      expect(message).toMatch(/openssl rand -base64 32/);
    });

    it('reassures that existing data still works', async () => {
      useKey(LEGACY_KEY);
      const result = await checkEncryptionKey(existingDb);
      const message = result.level === 'warn' ? result.message : '';
      expect(message).toMatch(/is readable and Peon will keep working/);
    });
  });

  describe('placeholder key', () => {
    it('refuses on a fresh install', async () => {
      useKey(PLACEHOLDER);
      await expect(checkEncryptionKey(freshDb)).resolves.toMatchObject({ ok: false });
    });

    it('still allows an existing install that somehow shipped with it', async () => {
      useKey(PLACEHOLDER);
      const result = await checkEncryptionKey(existingDb);
      expect(result.ok).toBe(true);
      expect(result.level === 'warn' && result.message).toMatch(/placeholder/);
    });
  });

  describe('unreachable database', () => {
    it('assumes an existing install and warns rather than refusing', async () => {
      // A transient database problem must not turn into a boot failure for a
      // running installation.
      useKey(LEGACY_KEY);
      const result = await checkEncryptionKey(brokenDb);
      expect(result.ok).toBe(true);
      expect(result.level).toBe('warn');
    });

    it('still passes cleanly for a strict key', async () => {
      useKey(STRICT_KEY);
      await expect(checkEncryptionKey(brokenDb)).resolves.toEqual({ ok: true, level: 'ok' });
    });
  });
});
