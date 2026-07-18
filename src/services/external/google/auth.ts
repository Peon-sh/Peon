import axios from 'axios';
import { UnauthorizedError } from '@/lib/errors';
import { isE2eMode } from '@/lib/e2e';

export interface GoogleUserInfo {
  id?: string;
  sub?: string;
  email: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
  email_verified?: boolean;
}

/** Exchange a Google access token for the user's profile. */
export async function verifyGoogleToken(accessToken: string): Promise<GoogleUserInfo> {
  if (isE2eMode()) {
    if (accessToken === 'invalid') {
      throw new UnauthorizedError('Invalid Google access token');
    }
    return {
      id: 'google-user-1',
      email: 'google.user@example.com',
      name: 'Google User',
      picture: 'https://example.com/a.png',
      verified_email: true,
    };
  }
  try {
    const { data } = await axios.get<GoogleUserInfo>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return data;
  } catch {
    throw new UnauthorizedError('Invalid Google access token');
  }
}

export function normalizeGoogleUser(info: GoogleUserInfo) {
  return {
    googleId: info.id ?? info.sub ?? '',
    email: info.email,
    name: info.name ?? info.email.split('@')[0],
    picture: info.picture,
    verified: info.verified_email ?? info.email_verified ?? false,
  };
}
