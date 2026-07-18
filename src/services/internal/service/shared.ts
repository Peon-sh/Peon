import crypto from 'node:crypto';

export const MASK = '••••••••';

export function randomToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
