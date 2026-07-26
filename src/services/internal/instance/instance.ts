import { prisma } from '@/lib/prisma';
import { ForbiddenError } from '@/lib/errors';
import type {
  UpdateInstanceSettingsInput,
  UpdateOauthSettingInput,
} from '@/schemas/instance.schema';

const settingsSelect = {
  id: true,
  instanceName: true,
  fqdn: true,
  isRegistrationEnabled: true,
  isApiEnabled: true,
  customDnsServers: true,
  publicPortMin: true,
  publicPortMax: true,
  instanceTimezone: true,
} as const;

/**
 * Whether `email` may create a brand-new account on this instance.
 *
 * `isRegistrationEnabled` was previously stored and rendered in the instance
 * admin UI but never read by the auth layer, so turning registration "off" did
 * nothing. Three cases still have to succeed when it is off:
 *
 * 1. **First admin.** A fresh instance with zero users must never be able to
 *    lock itself out — this is the bootstrap escape hatch.
 * 2. **Registration enabled** (the default).
 * 3. **Pending invitation.** Accepting an invite requires an authenticated
 *    user (`/api/invitations/[token]/accept` calls `requireUser()`), so invited
 *    people must be able to sign up. Without this branch, disabling public
 *    registration would silently break all team onboarding.
 */
export async function isRegistrationAllowed(email: string): Promise<boolean> {
  const userCount = await prisma.user.count();
  if (userCount === 0) return true;

  const settings = await prisma.instanceSettings.findUnique({
    where: { id: 'instance' },
    select: { isRegistrationEnabled: true },
  });
  // Absent row means defaults, and the default is open registration.
  if (settings?.isRegistrationEnabled !== false) return true;

  const [workspaceInvite, projectInvite] = await Promise.all([
    prisma.workspaceInvitation.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, status: 'PENDING' },
      select: { id: true },
    }),
    prisma.projectInvitation.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, status: 'PENDING' },
      select: { id: true },
    }),
  ]);
  return Boolean(workspaceInvite || projectInvite);
}

/** Throw unless `email` may register. See {@link isRegistrationAllowed}. */
export async function assertRegistrationAllowed(email: string): Promise<void> {
  if (await isRegistrationAllowed(email)) return;
  throw new ForbiddenError(
    'Registration is disabled on this instance. Ask an administrator for an invitation.',
    'REGISTRATION_DISABLED',
  );
}

export const InstanceService = {
  isRegistrationAllowed,
  assertRegistrationAllowed,

  async getSettings() {
    const settings = await prisma.instanceSettings.upsert({
      where: { id: 'instance' },
      create: { id: 'instance' },
      update: {},
      select: settingsSelect,
    });
    const oauthRows = await prisma.oauthSetting.findMany();
    const oauth = oauthRows.map((o) => ({
      id: o.id,
      provider: o.provider,
      enabled: o.enabled,
      clientId: o.clientId,
      redirectUri: o.redirectUri,
    }));
    return { settings, oauth };
  },

  async updateSettings(input: UpdateInstanceSettingsInput) {
    return prisma.instanceSettings.upsert({
      where: { id: 'instance' },
      create: { id: 'instance', ...input },
      update: input,
      select: settingsSelect,
    });
  },

  async upsertOauth(input: UpdateOauthSettingInput) {
    const { provider, ...rest } = input;
    const saved = await prisma.oauthSetting.upsert({
      where: { provider },
      create: {
        provider,
        ...rest,
      },
      update: {
        ...rest,
      },
    });
    return {
      id: saved.id,
      provider: saved.provider,
      enabled: saved.enabled,
      clientId: saved.clientId,
      redirectUri: saved.redirectUri,
    };
  },
};
