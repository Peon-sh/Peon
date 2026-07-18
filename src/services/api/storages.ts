import { api, unwrap } from '@/lib/http/axios';

export interface Storage {
  id: string;
  uuid: string;
  workspaceId: string;
  name: string;
  description: string | null;
  region: string;
  endpoint: string | null;
  bucket: string;
  isUsable: boolean;
  createdAt: string;
}

export interface CreateStoragePayload {
  name: string;
  description?: string | null;
  region?: string;
  endpoint?: string | null;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export function listStorages(workspaceId: string) {
  return unwrap<Storage[]>(api.get(`/workspaces/${workspaceId}/storages`));
}

export function createStorage(workspaceId: string, input: CreateStoragePayload) {
  return unwrap(api.post(`/workspaces/${workspaceId}/storages`, input));
}

export function updateStorage(storageId: string, input: Partial<CreateStoragePayload>) {
  return unwrap(api.patch(`/storages/${storageId}`, input));
}

export function deleteStorage(storageId: string) {
  return unwrap(api.delete(`/storages/${storageId}`));
}

export function testStorage(storageId: string) {
  return unwrap<{ reachable: boolean; error?: string }>(api.post(`/storages/${storageId}/test`));
}
