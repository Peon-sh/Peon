'use client';

import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getMe, loginWithGoogle } from '@/services/api/auth';
import { publicEnv } from '@/lib/env';
import { postAuthPath } from '@/lib/auth/post-auth-path';

export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  // Only mount the component that uses the Google hook when a client id is
  // configured, otherwise `useGoogleLogin` throws (no provider in the tree).
  if (!publicEnv.googleClientId) return null;
  return <GoogleButtonInner label={label} />;
}

function GoogleButtonInner({ label }: { label: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (resp) => {
      setLoading(true);
      try {
        const result = await loginWithGoogle(resp.access_token);
        // Wait for a successful /me (sets the auth store) before navigating so
        // the app shell never lands on dashboard with a null user + stale 401.
        await qc.fetchQuery({ queryKey: ['auth', 'me'], queryFn: getMe });
        const redirect =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('redirect')
            : null;
        router.replace(postAuthPath(result.user, redirect));
      } catch (e) {
        setLoading(false);
        toast.error(e instanceof Error ? e.message : 'Google sign-in failed');
      }
    },
    onError: () => {
      setLoading(false);
      toast.error('Google sign-in failed');
    },
    onNonOAuthError: () => {
      // Popup closed / blocked — stop the spinner.
      setLoading(false);
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        login();
      }}
    >
      {loading ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <svg className="mr-2 size-4" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
      )}
      {loading ? 'Signing in…' : label}
    </Button>
  );
}
