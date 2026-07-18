'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { publicEnv } from '@/lib/env';

export function GoogleProvider({ children }: { children: React.ReactNode }) {
  if (!publicEnv.googleClientId) return <>{children}</>;
  return <GoogleOAuthProvider clientId={publicEnv.googleClientId}>{children}</GoogleOAuthProvider>;
}
