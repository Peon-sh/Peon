import { cookies } from 'next/headers';
import { cookieName, verifyJWT, type JWTPayload } from './jwt';
import { AuthSessionService } from '@/services/internal/auth/sessions';
import { extractSessionMeta } from '@/lib/auth/session-meta';

/**
 * Read + validate auth: JWT must include an active AuthSession `sid`.
 * Cookies without sid (pre-session JWTs) are rejected.
 */
export async function getCurrentAuth(): Promise<JWTPayload | null> {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (!token) return null;
  try {
    const payload = await verifyJWT(token);
    // cookies() path has no request; lastSeen IP update skipped here.
    const session = await AuthSessionService.assertActive(payload.sid);
    if (!session) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.set(cookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export { extractSessionMeta };
