import { ForbiddenError } from '@/lib/errors';

export interface InviteeIdentity {
  id: string;
  email: string;
}

/**
 * Bind an invitation to the address it was sent to — tokens get forwarded, so
 * holding one cannot be enough to join. Compared case-insensitively for rows
 * predating email normalization.
 */
export function assertInvitedUser(invitedEmail: string, user: InviteeIdentity): void {
  const invited = invitedEmail.trim().toLowerCase();
  const accepting = user.email.trim().toLowerCase();
  if (!invited || invited !== accepting) {
    throw new ForbiddenError(
      `This invitation was sent to ${invitedEmail}. Sign in as that account to accept it.`,
      'INVITATION_EMAIL_MISMATCH',
    );
  }
}
