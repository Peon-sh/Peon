'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRight,
  Camera,
  Laptop,
  Loader2,
  Monitor,
  Server,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import { ConfirmButton } from '@/components/app/confirm';
import { PageContainer, Panel, Section } from '@/components/app/page';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changePassword,
  confirmAvatar,
  listAuthSessions,
  presignAvatar,
  removeAvatar,
  revokeAllAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  updateProfile,
  type AuthSessionDto,
} from '@/services/api/auth';
import { useAuthStore } from '@/store/auth';

function initials(name: string | null | undefined, email: string | undefined): string {
  const source = name?.trim() || email || '?';
  return source.slice(0, 2).toUpperCase();
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === 'mobile') return <Smartphone className="text-muted-foreground size-4 shrink-0" />;
  if (type === 'tablet') return <Tablet className="text-muted-foreground size-4 shrink-0" />;
  if (type === 'desktop') return <Laptop className="text-muted-foreground size-4 shrink-0" />;
  return <Monitor className="text-muted-foreground size-4 shrink-0" />;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, setSession, workspaces, clear } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [sessions, setSessions] = useState<AuthSessionDto[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await listAuthSessions();
      setSessions(data.sessions);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  function applyUser(next: NonNullable<typeof user>) {
    setSession(next, workspaces);
  }

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setSavingName(true);
    try {
      const { user: next } = await updateProfile({ name: trimmed });
      applyUser(next);
      toast.success('Name updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update name');
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarFile(file: File | null) {
    if (!file) return;
    const contentType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      toast.error('Use a JPEG, PNG, or WebP image');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    setUploadingAvatar(true);
    try {
      const { uploadUrl, key, headers } = await presignAvatar(contentType);
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': headers['Content-Type'] ?? contentType },
        body: file,
      });
      if (!put.ok) throw new Error('Upload to storage failed');
      const { user: next } = await confirmAvatar(key);
      applyUser(next);
      toast.success('Avatar updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      const { user: next } = await removeAvatar();
      applyUser(next);
      toast.success('Avatar removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handlePassword() {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      const { user: next } = await changePassword({
        currentPassword: user?.hasPassword ? currentPassword : undefined,
        newPassword,
      });
      applyUser(next);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(user?.hasPassword ? 'Password updated' : 'Password set');
      void refreshSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRevoke(id: string, isCurrent: boolean) {
    try {
      await revokeAuthSession(id);
      if (isCurrent) {
        clear();
        router.replace('/login');
        return;
      }
      toast.success('Session revoked');
      void refreshSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke session');
    }
  }

  async function handleRevokeOthers() {
    try {
      const { revoked } = await revokeOtherAuthSessions();
      toast.success(revoked ? `Revoked ${revoked} other session(s)` : 'No other sessions');
      void refreshSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke sessions');
    }
  }

  async function handleRevokeAll() {
    try {
      await revokeAllAuthSessions();
      clear();
      router.replace('/login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign out everywhere');
    }
  }

  return (
    <PageContainer>
      <Section title="profile" description="Your display name and photo across Peon.">
        <Panel
          contentClassName="space-y-5 p-4"
          footer={
            <Button
              size="sm"
              onClick={() => void handleSaveName()}
              disabled={savingName || name.trim() === (user?.name ?? '')}
            >
              {savingName ? 'Saving…' : 'Save name'}
            </Button>
          }
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="size-16" size="lg">
                <AvatarImage src={user?.profilePicture ?? undefined} alt="" />
                <AvatarFallback>{initials(user?.name, user?.email)}</AvatarFallback>
              </Avatar>
              {uploadingAvatar && (
                <div className="bg-background/70 absolute inset-0 flex items-center justify-center rounded-full">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={uploadingAvatar} asChild>
                <label className="inline-flex cursor-pointer items-center gap-1">
                  <Camera className="size-3.5" />
                  Upload
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      void handleAvatarFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
              </Button>
              {user?.profilePicture && (
                <ConfirmButton
                  title="Remove avatar?"
                  description="Your profile will show initials instead."
                  confirmLabel="Remove"
                  disabled={uploadingAvatar}
                  onConfirm={() => void handleRemoveAvatar()}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </ConfirmButton>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Your name"
            />
          </div>

          <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-wide">Email</p>
            <p className="text-[13.5px] font-semibold">{user?.email}</p>
          </div>
        </Panel>
      </Section>

      <Section
        title="password"
        description={
          user?.hasPassword
            ? 'Change your password. Other sessions will be signed out.'
            : 'Set a password so you can also sign in with email.'
        }
      >
        <Panel
          contentClassName="space-y-3 p-4"
          footer={
            <Button
              size="sm"
              onClick={() => void handlePassword()}
              disabled={
                savingPassword ||
                !newPassword ||
                !confirmPassword ||
                (user?.hasPassword && !currentPassword)
              }
            >
              {savingPassword
                ? 'Saving…'
                : user?.hasPassword
                  ? 'Update password'
                  : 'Set password'}
            </Button>
          }
        >
          {user?.hasPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </Panel>
      </Section>

      <Section
        title="sessions"
        description="Devices signed into your account. Revoke any you don’t recognize."
        actions={
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              title="Revoke other sessions?"
              description="You will stay signed in on this device."
              confirmLabel="Revoke others"
              onConfirm={() => void handleRevokeOthers()}
            >
              Revoke others
            </ConfirmButton>
            <ConfirmButton
              title="Sign out everywhere?"
              description="You will be signed out on this device too."
              confirmLabel="Sign out everywhere"
              onConfirm={() => void handleRevokeAll()}
            >
              Sign out everywhere
            </ConfirmButton>
          </div>
        }
      >
        <Panel contentClassName="divide-y">
          {loadingSessions ? (
            <div className="text-muted-foreground flex items-center gap-2 p-4 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">No active sessions.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <DeviceIcon type={session.deviceType} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-semibold">
                        {session.browser ?? 'Unknown browser'}
                        {session.os ? ` · ${session.os}` : ''}
                      </p>
                      {session.current && (
                        <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                          This device
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {[session.ip, session.country, session.deviceName]
                        .filter(Boolean)
                        .join(' · ') || 'Unknown location'}
                      {' · '}
                      Last seen {formatRelative(session.lastSeenAt)}
                    </p>
                  </div>
                </div>
                <ConfirmButton
                  title={session.current ? 'Sign out this device?' : 'Revoke session?'}
                  description={
                    session.current
                      ? 'You will need to sign in again.'
                      : 'That device will be signed out immediately.'
                  }
                  confirmLabel={session.current ? 'Sign out' : 'Revoke'}
                  size="xs"
                  onConfirm={() => void handleRevoke(session.id, session.current)}
                >
                  Revoke
                </ConfirmButton>
              </div>
            ))
          )}
        </Panel>
      </Section>

      {user?.isInstanceOwner && (
        <Section title="instance">
          <Panel contentClassName="divide-y">
            <Link
              href="/profile/instance"
              className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 transition-colors"
            >
              <span className="flex items-center gap-3 text-[12.5px] font-semibold">
                <Server className="text-muted-foreground size-4" /> Instance settings
              </span>
              <ArrowRight className="text-faint size-4" />
            </Link>
          </Panel>
        </Section>
      )}
    </PageContainer>
  );
}
