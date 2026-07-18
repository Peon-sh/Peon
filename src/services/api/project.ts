import { api, unwrap } from '@/lib/http/axios';

export interface ProjectListItem {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: { services: number; memberships: number };
}

export function listProjects(workspaceId: string) {
  return unwrap<ProjectListItem[]>(api.get(`/workspaces/${workspaceId}/projects`));
}

export function createProject(workspaceId: string, input: { name: string; description?: string }) {
  return unwrap<{ id: string }>(api.post(`/workspaces/${workspaceId}/projects`, input));
}

export function getProject(projectId: string) {
  return unwrap<{
    project: {
      id: string;
      name: string;
      description: string | null;
      workspaceId: string;
      settings: { wildcardDomain: string | null } | null;
      _count: { services: number };
    };
    canManage: boolean;
    role: string;
  }>(api.get(`/projects/${projectId}`));
}

export function updateProject(
  projectId: string,
  input: { name?: string; description?: string | null; wildcardDomain?: string | null },
) {
  return unwrap(api.patch(`/projects/${projectId}`, input));
}

export function deleteProject(projectId: string) {
  return unwrap(api.delete(`/projects/${projectId}`));
}

export interface ProjectMember {
  id: string;
  role: 'ADMIN' | 'MEMBER';
  user: { id: string; email: string; name: string | null; profilePicture: string | null };
}

export function getProjectMembers(projectId: string) {
  return unwrap<ProjectMember[]>(api.get(`/projects/${projectId}/members`));
}

export function addProjectMember(
  projectId: string,
  input: { userId: string; role: 'ADMIN' | 'MEMBER' },
) {
  return unwrap(api.post(`/projects/${projectId}/members`, input));
}

export function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: 'ADMIN' | 'MEMBER',
) {
  return unwrap(api.patch(`/projects/${projectId}/members/${userId}`, { role }));
}

export function removeProjectMember(projectId: string, userId: string) {
  return unwrap(api.delete(`/projects/${projectId}/members/${userId}`));
}
