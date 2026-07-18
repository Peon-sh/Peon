import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { AuthSessionService } from '@/services/internal/auth/sessions';
import { extractSessionMeta } from '@/lib/auth/session-meta';

export interface JWTPayload {
  userId: string;
  email: string;
  name: string | null;
  isInstanceAdmin: boolean;
  isInstanceOwner: boolean;
  isOnboarded: boolean;
  profilePicture?: string | null;
  /** AuthSession id — required for revokeable browser sessions. */
  sid?: string;
}

const JWT_ALGORITHM = 'HS256';

function secretKey(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET must be set');
  return new TextEncoder().encode(raw);
}

export function cookieName(): string {
  return process.env.JWT_KEY || 'peon-auth-token';
}

export async function generateJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifyJWT(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secretKey(), {
    algorithms: [JWT_ALGORITHM],
  });
  return payload as unknown as JWTPayload;
}

export function extractTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(cookieName())?.value ?? null;
}

/** Read the authenticated user from a request (middleware / route handlers). */
export async function getAuthFromRequest(request: NextRequest): Promise<JWTPayload | null> {
  const token = extractTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = await verifyJWT(token);
    const meta = extractSessionMeta(request.headers);
    const session = await AuthSessionService.assertActive(payload.sid, { ip: meta.ip });
    if (!session) return null;
    return payload;
  } catch {
    return null;
  }
}
