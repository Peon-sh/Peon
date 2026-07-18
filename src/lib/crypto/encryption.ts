import crypto from 'node:crypto';

/**
 * App-layer secret encryption using AES-256-GCM.
 * ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32).
 *
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

let keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (keyCache) return keyCache;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set');
  let key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    // Fall back to a SHA-256 digest so any provided secret yields a valid key.
    key = crypto.createHash('sha256').update(raw).digest();
  }
  keyCache = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function decrypt(payload: string): string {
  const parts = payload.split('.');
  // Empty ciphertext is valid (encrypt("") => "iv.tag."), so only require
  // exactly three segments with non-empty iv + auth tag.
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Invalid encrypted payload');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Encrypt a value only if present; passthrough null/undefined. */
export function encryptNullable(value?: string | null): string | null {
  return value ? encrypt(value) : null;
}

export function decryptNullable(value?: string | null): string | null {
  return value ? decrypt(value) : null;
}
