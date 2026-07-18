import { utils } from 'ssh2';
import crypto from 'node:crypto';

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
    const der = Buffer.from(base64, 'base64');
    const hash = crypto.createHash('sha256').update(der).digest('base64').replace(/=+$/, '');
    return `SHA256:${hash}`;
  } catch {
    return '';
  }
}
