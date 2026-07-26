import crypto from 'node:crypto';

/**
 * App-layer secret encryption using AES-256-GCM.
 *
 * Output format: base64(iv).base64(authTag).base64(ciphertext)
 *
 * ## Key modes
 *
 * `ENCRYPTION_KEY` is meant to be 32 bytes of base64 (`openssl rand -base64 32`).
 * Historically any string was accepted and silently SHA-256'd into a key, so
 * installations exist in the wild whose data is encrypted under
 * `sha256("whatever-they-typed")`.
 *
 * Both modes are supported, forever, because refusing a legacy key would make
 * an existing installation's SSH keys, database passwords, env values and LLM
 * credentials permanently unreadable:
 *
 * - **strict** — the value decodes to exactly 32 bytes. Used as the key directly.
 * - **legacy-derived** — anything else. SHA-256'd, as before, and reported by
 *   {@link encryptionKeyStatus} so callers can warn.
 *
 * Whether a legacy key is *acceptable* is a policy decision that needs to know
 * if the database is empty, so it lives in `lib/crypto/preflight.ts` — not here
 * and not in the env schema, neither of which can tell a fresh install from an
 * upgrade.
 *
 * ## Rotation
 *
 * Set `ENCRYPTION_KEY_PREVIOUS` to the old value while migrating. Decryption
 * tries the current key first and falls back to the previous one, so the app
 * keeps working against not-yet-rewritten rows. `pnpm encryption:rotate`
 * re-encrypts everything under the current key; drop the previous value once it
 * reports zero remaining rows.
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_BYTES = 32;

export const ENCRYPTION_KEY_HINT =
  'ENCRYPTION_KEY should be 32 bytes, base64-encoded. Generate one with: openssl rand -base64 32';

/** Placeholders shipped in `.env.example`. */
export const PLACEHOLDER_ENCRYPTION_KEYS = new Set([
  'change-me-32-byte-base64-key',
  'change-me-long-random-string',
]);

export type EncryptionKeyMode = 'strict' | 'legacy-derived';

export interface EncryptionKeyStatus {
  mode: EncryptionKeyMode;
  /** True when `ENCRYPTION_KEY_PREVIOUS` is set (rotation in progress). */
  hasPreviousKey: boolean;
  /** True when the key is still a value shipped in `.env.example`. */
  isPlaceholder: boolean;
}

interface ResolvedKey {
  key: Buffer;
  mode: EncryptionKeyMode;
}

let currentCache: ResolvedKey | null = null;
let previousCache: ResolvedKey | null | undefined;

/** True when a base64 string decodes to exactly 32 bytes. */
export function isValidEncryptionKey(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return Buffer.from(raw, 'base64').length === KEY_BYTES;
}

/**
 * Turn a configured value into an AES key.
 *
 * The legacy SHA-256 branch is load-bearing compatibility, not a fallback for
 * convenience — removing it destroys existing installations' data.
 */
function resolveKey(raw: string): ResolvedKey {
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === KEY_BYTES) {
    return { key: decoded, mode: 'strict' };
  }
  return { key: crypto.createHash('sha256').update(raw).digest(), mode: 'legacy-derived' };
}

function currentKey(): ResolvedKey {
  if (currentCache) return currentCache;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error(`ENCRYPTION_KEY is not set. ${ENCRYPTION_KEY_HINT}`);
  currentCache = resolveKey(raw);
  return currentCache;
}

function previousKey(): ResolvedKey | null {
  if (previousCache !== undefined) return previousCache;
  const raw = process.env.ENCRYPTION_KEY_PREVIOUS;
  previousCache = raw ? resolveKey(raw) : null;
  return previousCache;
}

/** How the configured key is being interpreted. Used for warnings and preflight. */
export function encryptionKeyStatus(): EncryptionKeyStatus {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  return {
    mode: currentKey().mode,
    hasPreviousKey: Boolean(process.env.ENCRYPTION_KEY_PREVIOUS),
    isPlaceholder: PLACEHOLDER_ENCRYPTION_KEYS.has(raw.trim()),
  };
}

/** Clear cached keys (tests, and after rotation tooling swaps env). */
export function resetEncryptionKeyCache(): void {
  currentCache = null;
  previousCache = undefined;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, currentKey().key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string {
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function decrypt(payload: string): string {
  const parts = payload.split('.');
  // Empty ciphertext is valid (encrypt("") => "iv.tag."), so only require
  // exactly three segments with non-empty iv + auth tag.
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Invalid encrypted payload');
  }
  const [ivB64, tagB64, dataB64] = parts;

  try {
    return decryptWith(currentKey().key, ivB64, tagB64, dataB64);
  } catch (err) {
    // GCM auth failure under the current key may just mean this row has not
    // been rotated yet. Try the previous key before giving up.
    const previous = previousKey();
    if (!previous) throw err;
    try {
      return decryptWith(previous.key, ivB64, tagB64, dataB64);
    } catch {
      // Report the current-key failure — the previous key is a fallback, not
      // the configured one, so its error would be misleading.
      throw err;
    }
  }
}

/**
 * Decrypt and report which key succeeded. Used by the rotation script to count
 * rows still sitting on the previous key.
 */
export function decryptWithSource(payload: string): { value: string; source: 'current' | 'previous' } {
  const parts = payload.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Invalid encrypted payload');
  }
  const [ivB64, tagB64, dataB64] = parts;
  try {
    return { value: decryptWith(currentKey().key, ivB64, tagB64, dataB64), source: 'current' };
  } catch (err) {
    const previous = previousKey();
    if (!previous) throw err;
    try {
      return { value: decryptWith(previous.key, ivB64, tagB64, dataB64), source: 'previous' };
    } catch {
      throw err;
    }
  }
}

/** Encrypt a value only if present; passthrough null/undefined. */
export function encryptNullable(value?: string | null): string | null {
  return value ? encrypt(value) : null;
}

export function decryptNullable(value?: string | null): string | null {
  return value ? decrypt(value) : null;
}
