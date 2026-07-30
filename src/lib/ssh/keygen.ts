import { utils } from 'ssh2';
import { sha256Fingerprint } from './host-key';

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
