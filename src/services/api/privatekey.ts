import { api, unwrap } from '@/lib/http/axios';

export interface PrivateKeyListItem {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  publicKey: string | null;
  fingerprint: string | null;
  isGitRelated: boolean;
  createdAt: string;
}

export interface PrivateKeyDetail {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  publicKey: string | null;
  fingerprint: string | null;
}

export interface CreatePrivateKeyPayload {
  name: string;
  description?: string;
  privateKey?: string;
  publicKey?: string;
  generate?: boolean;
}

export function listPrivateKeys(workspaceId: string) {
  return unwrap<PrivateKeyListItem[]>(api.get(`/workspaces/${workspaceId}/private-keys`));
}

export function createPrivateKey(workspaceId: string, input: CreatePrivateKeyPayload) {
  return unwrap<PrivateKeyDetail>(api.post(`/workspaces/${workspaceId}/private-keys`, input));
}

export function getPrivateKey(keyId: string) {
  return unwrap<PrivateKeyDetail>(api.get(`/private-keys/${keyId}`));
}

export function deletePrivateKey(keyId: string) {
  return unwrap(api.delete(`/private-keys/${keyId}`));
}

/** Download decrypted private key as a .pem file in the browser. */
export async function downloadPrivateKeyPem(keyId: string): Promise<void> {
  const res = await api.get(`/private-keys/${keyId}/download`, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'private-key.pem';
  const url = URL.createObjectURL(res.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
