import { api, unwrap } from '@/lib/http/axios';

export type SharedVariableScope = 'WORKSPACE' | 'PROJECT' | 'SERVER';

export interface SharedVariable {
  id: string;
  workspaceId: string;
  scope: SharedVariableScope;
  key: string;
  value: string;
  comment: string | null;
  isMultiline: boolean;
  isLiteral: boolean;
  projectId: string | null;
  serverId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSharedVariablePayload {
  scope: SharedVariableScope;
  key: string;
  value: string;
  comment?: string | null;
  isMultiline?: boolean;
  isLiteral?: boolean;
  projectId?: string | null;
  serverId?: string | null;
}

export function listSharedVariables(workspaceId: string) {
  return unwrap<SharedVariable[]>(api.get(`/workspaces/${workspaceId}/shared-variables`));
}

export function createSharedVariable(workspaceId: string, input: CreateSharedVariablePayload) {
  return unwrap(api.post(`/workspaces/${workspaceId}/shared-variables`, input));
}

export function updateSharedVariable(
  variableId: string,
  input: Partial<Pick<CreateSharedVariablePayload, 'key' | 'value' | 'comment' | 'isMultiline' | 'isLiteral'>>,
) {
  return unwrap(api.patch(`/shared-variables/${variableId}`, input));
}

export function deleteSharedVariable(variableId: string) {
  return unwrap(api.delete(`/shared-variables/${variableId}`));
}
