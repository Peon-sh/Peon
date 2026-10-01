import crypto from 'node:crypto';
import { utils } from 'ssh2';

/** SHA256 fingerprint of a raw SSH key blob, in the format OpenSSH prints. */
export function sha256Fingerprint(keyBlob: Buffer): string {
  const hash = crypto.createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${hash}`;
}

export interface GeneratedKeyPair {
  privateKey: string;
  publicKey: string;
  fingerprint: string;
}

/** Generate an ed25519 keypair in OpenSSH format. */
export function generateKeyPair(comment = 'peon'): GeneratedKeyPair {
  const result = utils.generateKeyPairSync('ed25519', { comment });
  return {
    privateKey: result.private,
    publicKey: result.public,
    fingerprint: fingerprintFromPublicKey(result.public),
  };
}

/** SHA256 fingerprint of an OpenSSH public key line. */
export function fingerprintFromPublicKey(publicKey: string): string {
  try {
    const base64 = publicKey.trim().split(/\s+/)[1];
    return sha256Fingerprint(Buffer.from(base64, 'base64'));
  } catch {
    return '';
  }
}
