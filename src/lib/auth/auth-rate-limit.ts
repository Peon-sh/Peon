import { extractSessionMeta } from '@/lib/auth/session-meta';
import { assertRateLimit } from '@/lib/rate-limit';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type AuthRateAction =
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'resend-otp'
  | 'verify-signup'
  | 'reset-password'
  | 'google';

const LIMITS: Record<
  AuthRateAction,
  { ip: { limit: number; windowMs: number }; email?: { limit: number; windowMs: number } }
> = {
  login: {
    ip: { limit: 20, windowMs: MINUTE },
    email: { limit: 10, windowMs: MINUTE },
  },
  signup: {
    ip: { limit: 20, windowMs: HOUR },
    email: { limit: 5, windowMs: HOUR },
  },
  'forgot-password': {
    ip: { limit: 20, windowMs: HOUR },
    email: { limit: 5, windowMs: HOUR },
  },
  'resend-otp': {
    ip: { limit: 20, windowMs: HOUR },
    email: { limit: 5, windowMs: HOUR },
  },
  'verify-signup': {
    ip: { limit: 30, windowMs: MINUTE },
    email: { limit: 15, windowMs: MINUTE },
  },
  'reset-password': {
    ip: { limit: 30, windowMs: MINUTE },
    email: { limit: 15, windowMs: MINUTE },
  },
  google: {
    ip: { limit: 20, windowMs: MINUTE },
  },
};

function clientIp(headers: Headers): string {
  return extractSessionMeta(headers).ip ?? 'unknown';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertAuthRateLimit(
  action: AuthRateAction,
  headers: Headers,
  email?: string,
): void {
  const limits = LIMITS[action];
  const ip = clientIp(headers);
  assertRateLimit(`auth:${action}:ip:${ip}`, limits.ip.limit, limits.ip.windowMs);

  if (limits.email && email) {
    assertRateLimit(
      `auth:${action}:email:${normalizeEmail(email)}`,
      limits.email.limit,
      limits.email.windowMs,
    );
  }
}
