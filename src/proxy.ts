import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth/jwt';
import { isInstanceOwnerEmail } from '@/lib/auth/instance-owner';
import { isPublicPath, isInstanceAdminPath } from '@/lib/routes/config';

function homeForAuth(auth: { isOnboarded?: boolean }): string {
  // Missing flag (old JWTs) → treat as onboarded so we don't trap existing sessions.
  return auth.isOnboarded === false ? '/onboarding' : '/dashboard';
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api');
  const auth = await getAuthFromRequest(request);

  // Browser / extension probes — never bounce these through the login flow.
  if (pathname.startsWith('/.well-known')) {
    return new NextResponse(null, { status: 404 });
  }

  // PWA / SEO static files under public/ — never send through the login redirect
  // (credentialsless manifest fetches were looping login?redirect=/site.webmanifest).
  if (
    pathname === '/site.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.webmanifest'
  ) {
    return NextResponse.next();
  }

  // App root always goes to login (or home if already signed in).
  // Only trust the JWT for this bounce when the path is `/`; login/register
  // must NOT auto-redirect on cookie alone (stale JWT after DB reset loops
  // login ↔ dashboard forever because /api/auth/me 401s while middleware
  // still thinks the session is valid).
  if (pathname === '/') {
    if (auth) return NextResponse.redirect(new URL(homeForAuth(auth), request.url));
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Public paths: leave login/register alone — AuthProvider validates via /me.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Everything else requires authentication.
  if (!auth) {
    if (isApi) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Keep unfinished users on onboarding (except the onboarding page itself + APIs).
  if (auth.isOnboarded === false && !isApi && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }
  if (auth.isOnboarded !== false && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const isOwner = auth.isInstanceOwner || isInstanceOwnerEmail(auth.email);
  if (isInstanceAdminPath(pathname) && !isOwner) {
    if (isApi) {
      return NextResponse.json(
        { success: false, message: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Forward the resolved user id to downstream handlers.
  const headers = new Headers(request.headers);
  headers.set('x-user-id', auth.userId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|logos|.*\\.(?:png|jpg|jpeg|svg|ico|webp|webmanifest)$).*)',
  ],
};
