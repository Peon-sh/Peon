import axios from 'axios';
import { AppError, UnauthorizedError } from '@/lib/errors';
import { isE2eMode } from '@/lib/e2e';

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_TIMEOUT_MS = 10_000;

export interface GoogleUserInfo {
  id?: string;
  sub?: string;
  email: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
  email_verified?: boolean;
}

/** `tokeninfo` response for an access token — booleans arrive as strings. */
interface GoogleTokenInfo {
  aud?: string;
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
}

/**
 * Client IDs tokens may be minted for; sign-in fails closed when none is set.
 * Both vars are accepted because the browser mints against the public one,
 * and a stale server-side value would otherwise reject every login.
 */
function googleClientIds(): string[] {
  const ids = [process.env.GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value);
  if (!ids.length) {
    throw new AppError(
      'Google sign-in is not configured on this instance.',
      503,
      'GOOGLE_NOT_CONFIGURED',
    );
  }
  return ids;
}

function isTrue(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

/** Profile fields are cosmetic, so a failure here must not fail the sign-in. */
async function fetchGoogleProfile(accessToken: string): Promise<Partial<GoogleUserInfo>> {
  try {
    const { data } = await axios.get<GoogleUserInfo>(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: GOOGLE_TIMEOUT_MS,
    });
    return data;
  } catch {
    return {};
  }
}

/**
 * Validate a Google access token and return the profile behind it. Access
 * tokens are bearer-only and resolve against `userinfo` whatever app minted
 * them, so the audience check is what makes this an authentication.
 */
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

  const clientIds = googleClientIds();

  let info: GoogleTokenInfo;
  try {
    const { data } = await axios.get<GoogleTokenInfo>(TOKENINFO_URL, {
      params: { access_token: accessToken },
      timeout: GOOGLE_TIMEOUT_MS,
    });
    info = data;
  } catch {
    throw new UnauthorizedError('Invalid Google access token');
  }

  const audience = [info.aud, info.azp].filter((value): value is string => !!value);
  if (!audience.some((value) => clientIds.includes(value))) {
    throw new UnauthorizedError('Google token was not issued for this application');
  }
  if (!info.email) {
    throw new UnauthorizedError('Google token is missing the email scope');
  }
  if (!isTrue(info.email_verified)) {
    throw new UnauthorizedError('Google account email is not verified');
  }

  const profile = await fetchGoogleProfile(accessToken);
  const profileId = profile.id ?? profile.sub;
  // Pin the profile to the subject the audience check ran against.
  if (info.sub && profileId && profileId !== info.sub) {
    throw new UnauthorizedError('Invalid Google access token');
  }

  // `googleId` is a unique column, so a blank subject would collide across users.
  const subject = info.sub ?? profileId;
  if (!subject) throw new UnauthorizedError('Invalid Google access token');

  return {
    ...profile,
    id: subject,
    email: info.email,
    verified_email: true,
  };
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
