import { api, unwrap } from '@/lib/http/axios';

export interface InvitationDetails {
  type: 'workspace' | 'project';
  email: string;
  role: string;
  status: string;
  target: string;
}

export function getInvitation(token: string) {
  return unwrap<InvitationDetails>(api.get(`/invitations/${token}`));
}

export function acceptInvitation(token: string) {
  return unwrap<{ type: string; workspaceId?: string; projectId?: string }>(
    api.post(`/invitations/${token}/accept`),
  );
}
