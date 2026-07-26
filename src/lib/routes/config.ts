import type { RouteConfig } from './types';

/**
 * Page-level access rules. Workspace/project role checks happen in the API /
 * service layer (roles are scoped per-workspace, not global), so middleware
 * only enforces authentication and instance-admin gating.
 */
export const PUBLIC_PATHS: string[] = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/google/callback',
  '/api/auth/me',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/verify-signup',
  '/api/auth/resend-otp',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/google/verify',
  '/api/auth/logout',
  '/api/health',
  // invitation preview is token-authenticated (no session)
  '/api/invitations',
  '/invitations',
  '/sitemap.xml',
  '/robots.txt',
  '/site.webmanifest',
  // service deploy webhooks are authenticated by token / GitHub HMAC, not session
  '/api/webhooks',
  // Stripe Billing webhooks (signature-verified)
  '/api/stripe/webhook',
  // GitHub App webhook path (no /api prefix)
  '/webhooks',
  // MCP server authenticates with workspace API tokens (Bearer)
  '/mcp',
  // peon-ping-pong agent push (Bearer sentinel token)
  '/api/v1/agents',
  // First-administrator bootstrap. Authenticated by a single-use setup token
  // and refused outright once any user exists, so it cannot be replayed.
  '/api/setup',
  '/setup',
];

export const INSTANCE_ADMIN_PATHS: string[] = ['/profile/instance', '/admin'];

export const ROUTES: RouteConfig[] = [
  ...PUBLIC_PATHS.map((path) => ({ path, isPublic: true })),
  ...INSTANCE_ADMIN_PATHS.map((path) => ({ path, instanceAdminOnly: true })),
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function isInstanceAdminPath(pathname: string): boolean {
  return INSTANCE_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
