'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getMe, logout } from '@/services/api/auth';
import { useAuthStore } from '@/store/auth';
import { isPublicPath } from '@/lib/routes/config';
import { postAuthPath } from '@/lib/auth/post-auth-path';
import { identifyUser, resetAnalytics } from '@/lib/analytics';

/**
 * Hydrates the auth store from `/api/auth/me`. Middleware already enforces
 * route protection; this keeps the client store in sync.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { setSession, clear } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicRoute = isPublicPath(pathname);
  // Only /login needs an "already signed in?" check. /register must not poll /me
  // (guests 401 by design; pairing that with removeQueries caused me↔logout spam).
  const onLogin = pathname === '/login';
  const clearingRef = useRef(false);
  const guestClearedRef = useRef(false);

  const { data, isError, isFetched, isFetching, fetchStatus, isSuccess } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: !publicRoute || onLogin,
    retry: false,
    staleTime: 0,
  });

  // Only treat failure when the latest request has finished. A pre-login 401
  // leaves isError=true; after Google/password login we refetch and must not
  // call logout() while that refetch is in flight (it would wipe the new cookie).
  const settledError = isError && isFetched && !isFetching && fetchStatus === 'idle';

  useEffect(() => {
    if (data) {
      setSession(data.user, data.workspaces);
      identifyUser(data.user);
    }
  }, [data, setSession]);

  // Route new users through the onboarding wizard until they finish or skip it.
  useEffect(() => {
    if (!data || publicRoute) return;
    // Strict === false: stale cached responses without the field must not
    // force users into the wizard.
    if (data.user.isOnboarded === false && pathname !== '/onboarding') {
      router.replace('/onboarding');
    } else if (data.user.isOnboarded && pathname === '/onboarding') {
      router.replace('/dashboard');
    }
  }, [data, publicRoute, pathname, router]);

  // Valid session on /login → continue into the app.
  useEffect(() => {
    if (!onLogin) return;
    if (!isSuccess || !data || isFetching) return;
    router.replace(postAuthPath(data.user, searchParams.get('redirect')));
  }, [data, onLogin, router, searchParams, isSuccess, isFetching]);

  useEffect(() => {
    if (!settledError) {
      guestClearedRef.current = false;
      return;
    }

    // /login while logged out: 401 is expected. Clear local state + cookie once.
    // Do NOT removeQueries — that re-fetches /me while still enabled and loops
    // with logout (me 401 → logout → me 401 → …).
    if (onLogin) {
      if (guestClearedRef.current) return;
      guestClearedRef.current = true;
      clear();
      resetAnalytics();
      void logout().catch(() => undefined);
      return;
    }

    if (publicRoute || clearingRef.current) return;
    clearingRef.current = true;
    clear();
    resetAnalytics();
    qc.removeQueries({ queryKey: ['auth', 'me'] });
    void logout()
      .catch(() => undefined)
      .finally(() => {
        router.replace('/login');
        clearingRef.current = false;
      });
  }, [settledError, publicRoute, onLogin, clear, router, qc]);

  return <>{children}</>;
}
