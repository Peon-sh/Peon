import crypto from 'node:crypto';

/**
 * SSH host key verification.
 *
 * ssh2 accepts any host key when `hostVerifier` is not supplied, so every
 * connection has to build one. A server's key is either pinned by the user when
 * the server is added, or recorded on the first successful connection and
 * checked against every connection after that.
 */

/** SHA256 fingerprint of a raw SSH key blob, in the format OpenSSH prints. */
export function sha256Fingerprint(keyBlob: Buffer): string {
  const hash = crypto.createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${hash}`;
}

/**
 * Normalize a user-supplied fingerprint to `SHA256:<base64>`.
 *
 * Accepts what people actually have on hand:
 * - `SHA256:Abc123…` (what OpenSSH prints)
 * - `Abc123…` (the bare base64 digest)
 * - a full `ssh-keygen -lf` line, e.g. `256 SHA256:Abc123… root@host (ED25519)`
 *
 * Returns null when the input is not a SHA256 fingerprint. MD5 fingerprints
 * (`16:27:ac:…`) are rejected rather than silently accepted.
 */
export function normalizeHostKeyFingerprint(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Pull `SHA256:xxx` out of a longer line if present.
  const tagged = trimmed.match(/SHA256:([A-Za-z0-9+/=]+)/i);
  const digest = (tagged ? tagged[1] : trimmed).replace(/=+$/, '');

  // A SHA-256 digest is 32 bytes → 43 base64 characters without padding.
  if (!/^[A-Za-z0-9+/]{43}$/.test(digest)) return null;
  return `SHA256:${digest}`;
}

export interface HostKeyMismatch {
  expected: string;
  actual: string;
}

export class HostKeyMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(host: string, mismatch: HostKeyMismatch) {
    super(
      `SSH host key mismatch for ${host}: expected ${mismatch.expected}, got ${mismatch.actual}. ` +
        'If this server was rebuilt or its host key was rotated, clear the trusted host key ' +
        'for it and reconnect. Otherwise the connection may be intercepted.',
    );
    this.name = 'HostKeyMismatchError';
    this.expected = mismatch.expected;
    this.actual = mismatch.actual;
  }
}

export interface HostKeyVerifier {
  /** Pass to ssh2 as `hostVerifier`. */
  verify: (key: Buffer) => boolean;
  /** Set when `verify` rejected a key, so the caller can raise a useful error. */
  readonly mismatch: HostKeyMismatch | null;
  /** Set when nothing was pinned and `verify` accepted a key, so it can be stored. */
  readonly learned: string | null;
}

/**
 * Build a `hostVerifier` for ssh2.
 *
 * With a pinned fingerprint the key must match exactly. Without one the key is
 * accepted and reported through `learned` (trust on first use) so the caller can
 * pin it for subsequent connections.
 *
 * A pin that cannot be parsed is treated as "not pinned" rather than as a
 * mismatch — a bad stored value should not lock a server out with no way back.
 */
export function createHostKeyVerifier(opts: { expected?: string | null }): HostKeyVerifier {
  const expected = normalizeHostKeyFingerprint(opts.expected);
  let mismatch: HostKeyMismatch | null = null;
  let learned: string | null = null;

  return {
    verify(key: Buffer): boolean {
      const actual = sha256Fingerprint(key);
      if (!expected) {
        learned = actual;
        return true;
      }
      if (actual === expected) return true;
      mismatch = { expected, actual };
      return false;
    },
    get mismatch() {
      return mismatch;
    },
    get learned() {
      return learned;
    },
  };
}
