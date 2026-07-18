import crypto from 'node:crypto';
import { emailOtpStore } from '@/services/internal/auth/email-otp-store';
import { hashPassword, comparePassword } from '@/lib/auth/password';
import { enqueueEmail } from '@/lib/email/enqueue';
import { otpEmailTemplate } from '@/lib/email/templates/otp';
import type { OtpPurpose } from '@/lib/prisma';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export const OTPService = {
  async generateAndSend(email: string, purpose: OtpPurpose): Promise<void> {
    await emailOtpStore.deleteForEmail(email, purpose);
    const code = generateCode();
    const codeHash = await hashPassword(code);
    await emailOtpStore.create({
      email,
      codeHash,
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    const template = otpEmailTemplate(code, purpose);
    await enqueueEmail({ to: email, ...template });
  },

  /** Verify a code. Returns true when valid; consumes it on success. */
  async verify(email: string, purpose: OtpPurpose, code: string): Promise<boolean> {
    const record = await emailOtpStore.findLatest(email, purpose);
    if (!record) return false;
    if (record.expiresAt < new Date()) return false;
    if (record.attempts >= MAX_ATTEMPTS) return false;

    const valid = await comparePassword(code, record.codeHash);
    if (!valid) {
      await emailOtpStore.incrementAttempts(record.id);
      return false;
    }
    await emailOtpStore.markConsumed(record.id);
    return true;
  },
};
