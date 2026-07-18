import { api, unwrap } from '@/lib/http/axios';

export interface TokenListItem {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedToken {
  id: string;
  name: string;
  expiresAt: string | null;
  createdAt: string;
  token: string;
}

export function listTokens(workspaceId: string) {
  return unwrap<TokenListItem[]>(api.get(`/workspaces/${workspaceId}/tokens`));
}

export function createToken(workspaceId: string, input: { name: string; expiresAt?: string }) {
  return unwrap<CreatedToken>(api.post(`/workspaces/${workspaceId}/tokens`, input));
}

export function deleteToken(tokenId: string) {
  return unwrap(api.delete(`/tokens/${tokenId}`));
}
