import { api, unwrap } from '@/lib/http/axios';

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  personal: boolean;
  description: string | null;
  _count: { projects: number; memberships: number };
}

export interface Member {
  id: string;
  role: 'OWNER' | 'BILLING_ADMIN' | 'ADMIN' | 'MEMBER';
  user: { id: string; email: string; name: string | null; profilePicture: string | null };
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export function listWorkspaces() {
  return unwrap<WorkspaceListItem[]>(api.get('/workspaces'));
}

export function createWorkspace(input: { name: string; description?: string }) {
  return unwrap<{ id: string }>(api.post('/workspaces', input));
}

export function updateWorkspace(id: string, input: { name?: string; description?: string | null }) {
  return unwrap(api.patch(`/workspaces/${id}`, input));
}

export function deleteWorkspace(id: string) {
  return unwrap(api.delete(`/workspaces/${id}`));
}

export function leaveWorkspace(id: string) {
  return unwrap(api.post(`/workspaces/${id}/leave`));
}

export function transferWorkspaceOwnership(
  id: string,
  input: { targetUserId: string; formerOwnerDisposition: 'ADMIN' | 'MEMBER' | 'LEAVE' },
) {
  return unwrap(api.post(`/workspaces/${id}/transfer-ownership`, input));
}

export type WorkspaceDeletePreflight = {
  workspace: { id: string; name: string; personal: boolean };
  projects: Array<{
    id: string;
    name: string;
    services: Array<{ id: string; name: string }>;
  }>;
  canDelete: boolean;
  blockers: { projectCount: number; serviceCount: number };
};

export function getWorkspaceDeletePreflight(id: string) {
  return unwrap<WorkspaceDeletePreflight>(api.get(`/workspaces/${id}/delete-preflight`));
}

export type AuditLogItem = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  summary: string;
  metadata: unknown;
  actorType: string;
  actorRole: string | null;
  createdAt: string;
  actor: { id: string; email: string; name: string | null } | null;
};

export type AuditListResult = {
  items: AuditLogItem[];
  nextCursor: string | null;
};

export function listWorkspaceAudit(
  id: string,
  params: Record<string, string | number | undefined | null> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return unwrap<AuditListResult>(api.get(`/workspaces/${id}/audit${qs ? `?${qs}` : ''}`));
}

export function getWorkspaceMembers(id: string) {
  return unwrap<{ members: Member[]; invitations: Invitation[] }>(
    api.get(`/workspaces/${id}/members`),
  );
}

export function inviteWorkspaceMember(id: string, input: { email: string; role: string }) {
  return unwrap(api.post(`/workspaces/${id}/members`, input));
}

export function updateWorkspaceMemberRole(id: string, userId: string, role: string) {
  return unwrap(api.patch(`/workspaces/${id}/members/${userId}`, { role }));
}

export function removeWorkspaceMember(id: string, userId: string) {
  return unwrap(api.delete(`/workspaces/${id}/members/${userId}`));
}

export function revokeWorkspaceInvitation(id: string, invitationId: string) {
  return unwrap(api.delete(`/workspaces/${id}/invitations/${invitationId}`));
}
