import { prisma } from '@/lib/prisma';
import type { OtpPurpose } from '@/lib/prisma';

/** Persistence helpers for email OTP rows (used by OTPService). */
export const emailOtpStore = {
  create(data: { email: string; codeHash: string; purpose: OtpPurpose; expiresAt: Date }) {
    return prisma.emailOtp.create({ data: { ...data, email: data.email.toLowerCase() } });
  },

  findLatest(email: string, purpose: OtpPurpose) {
    return prisma.emailOtp.findFirst({
      where: { email: email.toLowerCase(), purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  markConsumed(id: string) {
    return prisma.emailOtp.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  incrementAttempts(id: string) {
    return prisma.emailOtp.update({ where: { id }, data: { attempts: { increment: 1 } } });
  },

  deleteForEmail(email: string, purpose: OtpPurpose) {
    return prisma.emailOtp.deleteMany({ where: { email: email.toLowerCase(), purpose } });
  },
};

/** @deprecated Use emailOtpStore — kept briefly for any external imports. */
export const emailOtpRepository = emailOtpStore;
