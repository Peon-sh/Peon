import { api, unwrap } from '@/lib/http/axios';

export interface InstanceSettings {
  id: string;
  instanceName: string;
  fqdn: string | null;
  isRegistrationEnabled: boolean;
  isApiEnabled: boolean;
  customDnsServers: string;
  publicPortMin: number;
  publicPortMax: number;
  instanceTimezone: string;
}

export interface OauthSetting {
  id: string;
  provider: string;
  enabled: boolean;
  clientId: string | null;
  redirectUri: string | null;
}

export interface InstanceSettingsResponse {
  settings: InstanceSettings;
  oauth: OauthSetting[];
}

export interface UpdateInstancePayload {
  settings?: Partial<Omit<InstanceSettings, 'id'>>;
  oauth?: {
    provider: string;
    enabled?: boolean;
    clientId?: string | null;
    redirectUri?: string | null;
  };
}

export function getInstanceSettings() {
  return unwrap<InstanceSettingsResponse>(api.get('/instance/settings'));
}

export function updateInstanceSettings(input: UpdateInstancePayload) {
  return unwrap<InstanceSettingsResponse>(api.patch('/instance/settings', input));
}
