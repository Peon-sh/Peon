import { z } from 'zod';

const attributionField = z.string().trim().min(1).max(200).optional();

/** Optional first-touch campaign attribution (strict allowlist). */
export const attributionSchema = z
  .object({
    utmSource: attributionField,
    utmMedium: attributionField,
    utmCampaign: attributionField,
    utmContent: attributionField,
    utmTerm: attributionField,
    ref: attributionField,
    gclid: attributionField,
    fbclid: attributionField,
    msclkid: attributionField,
    campaign: attributionField,
    landingPath: attributionField,
    landingUrl: z.string().trim().min(1).max(500).optional(),
    referrer: z.string().trim().min(1).max(500).optional(),
    capturedAt: z.string().trim().min(1).max(40).optional(),
    rawQuery: z.record(z.string(), z.string().max(200)).optional(),
  })
  .optional();

export const signupInitiateSchema = z.object({
  email: z.string().email(),
});

export const signupCompleteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
  code: z.string().length(6),
  attribution: attributionSchema,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const googleVerifySchema = z.object({
  accessToken: z.string().min(1),
  attribution: attributionSchema,
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['SIGNUP', 'RESET_PASSWORD']).default('SIGNUP'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

export const avatarPresignSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const avatarConfirmSchema = z.object({
  key: z.string().min(1).max(512),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8),
});

export type SignupInitiateInput = z.infer<typeof signupInitiateSchema>;
export type SignupCompleteInput = z.infer<typeof signupCompleteSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
