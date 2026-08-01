import { api, unwrap } from '@/lib/http/axios';
import type { AttributionInput } from '@/lib/attribution';
import type { SessionUser, WorkspaceSummary } from '@/store/auth';

export interface MeResponse {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
}

export type AuthSessionDto = {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
  browser: string | null;
  browserEngine: string | null;
  os: string | null;
  deviceType: string | null;
  deviceName: string | null;
  platform: string | null;
  country: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export function getMe() {
  return unwrap<MeResponse>(api.get('/auth/me'));
}

export function initiateSignup(email: string) {
  return unwrap<{ message: string }>(api.post('/auth/signup', { email }));
}

export function completeSignup(input: {
  email: string;
  name: string;
  password: string;
  code: string;
  attribution?: AttributionInput | null;
}) {
  return unwrap<{ user: SessionUser }>(api.post('/auth/verify-signup', input));
}

export function login(email: string, password: string) {
  return unwrap<{ user: SessionUser }>(api.post('/auth/login', { email, password }));
}

export function loginWithGoogle(accessToken: string, attribution?: AttributionInput | null) {
  return unwrap<{ user: SessionUser }>(
    api.post('/auth/google/verify', { accessToken, attribution: attribution ?? undefined }),
  );
}

export function resendOtp(email: string, purpose: 'SIGNUP' | 'RESET_PASSWORD' = 'SIGNUP') {
  return unwrap<{ message: string }>(api.post('/auth/resend-otp', { email, purpose }));
}

export function forgotPassword(email: string) {
  return unwrap<{ message: string }>(api.post('/auth/forgot-password', { email }));
}

export function resetPassword(input: { email: string; code: string; newPassword: string }) {
  return unwrap<{ message: string }>(api.post('/auth/reset-password', input));
}

export function completeOnboarding() {
  return unwrap<{ isOnboarded: boolean }>(api.post('/auth/onboarding'));
}

export function logout() {
  return unwrap<{ message: string }>(api.post('/auth/logout'));
}

export function updateProfile(input: { name: string }) {
  return unwrap<{ user: SessionUser }>(api.patch('/auth/profile', input));
}

export function presignAvatar(contentType: 'image/jpeg' | 'image/png' | 'image/webp') {
  return unwrap<{
    uploadUrl: string;
    key: string;
    publicUrl: string;
    headers: Record<string, string>;
  }>(api.post('/auth/profile/avatar/presign', { contentType }));
}

export function confirmAvatar(key: string) {
  return unwrap<{ user: SessionUser }>(api.post('/auth/profile/avatar/confirm', { key }));
}

export function removeAvatar() {
  return unwrap<{ user: SessionUser }>(api.delete('/auth/profile/avatar'));
}

export function changePassword(input: { currentPassword?: string; newPassword: string }) {
  return unwrap<{ user: SessionUser }>(api.post('/auth/profile/password', input));
}

export function listAuthSessions() {
  return unwrap<{ sessions: AuthSessionDto[] }>(api.get('/auth/sessions'));
}

export function revokeAuthSession(id: string) {
  return unwrap<{ revoked: boolean }>(api.delete(`/auth/sessions/${id}`));
}

export function revokeOtherAuthSessions() {
  return unwrap<{ revoked: number }>(api.post('/auth/sessions/revoke-others'));
}

export function revokeAllAuthSessions() {
  return unwrap<{ revoked: number }>(api.post('/auth/sessions/revoke-all'));
}
