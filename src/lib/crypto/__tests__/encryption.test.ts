import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, encryptNullable, decryptNullable } from '../encryption';

describe('encryption', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('round-trips plaintext', () => {
    const payload = encrypt('hello-secret');
    expect(payload.split('.')).toHaveLength(3);
    expect(decrypt(payload)).toBe('hello-secret');
  });

  it('round-trips empty string', () => {
    const payload = encrypt('');
    expect(payload.endsWith('.')).toBe(true);
    expect(decrypt(payload)).toBe('');
  });

  it('rejects malformed payloads', () => {
    expect(() => decrypt('not-encrypted')).toThrow('Invalid encrypted payload');
    expect(() => decrypt('only.two')).toThrow('Invalid encrypted payload');
  });

  it('nullable helpers treat empty as absent on encrypt, decrypt empty ciphertext', () => {
    expect(encryptNullable('')).toBeNull();
    expect(encryptNullable(null)).toBeNull();
    expect(decryptNullable(null)).toBeNull();
    expect(decryptNullable(encrypt(''))).toBe('');
  });
});
