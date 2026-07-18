import { api, unwrap } from '@/lib/http/axios';

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
  _count?: { services: number };
}

export function listTags(workspaceId: string) {
  return unwrap<Tag[]>(api.get(`/workspaces/${workspaceId}/tags`));
}

export function createTag(workspaceId: string, input: { name: string }) {
  return unwrap(api.post(`/workspaces/${workspaceId}/tags`, input));
}

export function deleteTag(tagId: string) {
  return unwrap(api.delete(`/tags/${tagId}`));
}
