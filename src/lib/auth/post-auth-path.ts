/** Static / non-page paths that must never be used as post-login redirects. */
const UNSAFE_REDIRECT =
  /\.(?:webmanifest|json|xml|txt|map|css|js|mjs|png|jpe?g|svg|ico|webp|gif|woff2?)$/i;

/**
 * Post-auth landing path based on onboarding status.
 * Only same-origin app paths are accepted as preferred redirects.
 */
export function postAuthPath(
  user: { isOnboarded?: boolean },
  preferredRedirect?: string | null,
): string {
  if (user.isOnboarded === false) return '/onboarding';
  if (isSafeAppRedirect(preferredRedirect)) {
    return preferredRedirect;
  }
  return '/dashboard';
}

export function isSafeAppRedirect(path: string | null | undefined): path is string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return false;
  if (path.startsWith('/api') || path.startsWith('/login') || path.startsWith('/register')) {
    return false;
  }
  if (UNSAFE_REDIRECT.test(path)) return false;
  return true;
}
