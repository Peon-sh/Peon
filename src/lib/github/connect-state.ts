import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';

export type GithubConnectState = {
  workspaceId: string;
  userId: string;
  exp: number;
  nonce: string;
};

const STATE_TTL_SECONDS = 15 * 60;

function stateSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET must be set');
  return raw;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Create a signed, short-lived connect state for the GitHub install redirect. */
export function signGithubConnectState(input: {
  workspaceId: string;
  userId: string;
}): string {
  const payload: GithubConnectState = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    nonce: randomBytes(8).toString('hex'),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyGithubConnectState(state: string | null | undefined): GithubConnectState {
  if (!state || !state.includes('.')) {
    throw new AppError('Invalid GitHub connect state.', 400, 'GITHUB_CONNECT_STATE_INVALID');
  }
  const [body, sig] = state.split('.', 2);
  if (!body || !sig) {
    throw new AppError('Invalid GitHub connect state.', 400, 'GITHUB_CONNECT_STATE_INVALID');
  }
  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) {
    throw new AppError('Invalid GitHub connect state.', 400, 'GITHUB_CONNECT_STATE_INVALID');
  }
  let payload: GithubConnectState;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GithubConnectState;
  } catch {
    throw new AppError('Invalid GitHub connect state.', 400, 'GITHUB_CONNECT_STATE_INVALID');
  }
  if (
    typeof payload.workspaceId !== 'string' ||
    typeof payload.userId !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    throw new AppError('Invalid GitHub connect state.', 400, 'GITHUB_CONNECT_STATE_INVALID');
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError('GitHub connect session expired. Try again.', 400, 'GITHUB_CONNECT_STATE_EXPIRED');
  }
  return payload;
}
