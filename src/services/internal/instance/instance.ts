import { prisma } from '@/lib/prisma';
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

export const InstanceService = {
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
