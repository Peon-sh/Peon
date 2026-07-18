import { api, unwrap } from '@/lib/http/axios';

export type GithubAppKind = 'CUSTOM' | 'PLATFORM';
export type GithubAppStatus = 'CONNECTED' | 'SUSPENDED' | 'DISCONNECTED';

export interface GithubSource {
  id: string;
  uuid: string;
  workspaceId: string;
  name: string;
  organization: string | null;
  /** GitHub installation account type: Organization | User */
  accountType: string | null;
  apiUrl: string;
  htmlUrl: string;
  customUser: string;
  customPort: number;
  appId: string | null;
  installationId: string | null;
  clientId: string | null;
  privateKeyId: string | null;
  kind: GithubAppKind;
  status: GithubAppStatus;
  isSystemWide: boolean;
  isPublic: boolean;
  createdAt: string;
}

export interface GitlabSource {
  id: string;
  uuid: string;
  workspaceId: string;
  name: string;
  organization: string | null;
  apiUrl: string;
  htmlUrl: string;
  customUser: string;
  customPort: number;
  appId: string | null;
  oauthId: number | null;
  groupName: string | null;
  privateKeyId: string | null;
  isSystemWide: boolean;
  isPublic: boolean;
  createdAt: string;
}

export interface SourcesList {
  github: GithubSource[];
  gitlab: GitlabSource[];
  platformGithubConfigured: boolean;
}

export type SourceDetail =
  | ({ provider: 'github' } & GithubSource)
  | ({ provider: 'gitlab' } & GitlabSource);

export interface GithubRepositoryOption {
  id: number;
  fullName: string;
  name: string;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
}

export type CreateSourcePayload =
  | ({ provider: 'github' } & Partial<Omit<GithubSource, 'id' | 'uuid' | 'workspaceId' | 'createdAt' | 'kind' | 'status'>> & {
        name: string;
        clientSecret?: string;
        webhookSecret?: string;
      })
  | ({ provider: 'gitlab' } & Partial<Omit<GitlabSource, 'id' | 'uuid' | 'workspaceId' | 'createdAt'>> & {
        name: string;
        appSecret?: string;
        webhookToken?: string;
      });

export function listSources(workspaceId: string) {
  return unwrap<SourcesList>(api.get(`/workspaces/${workspaceId}/sources`));
}

export function createSource(workspaceId: string, input: CreateSourcePayload) {
  return unwrap(api.post(`/workspaces/${workspaceId}/sources`, input));
}

export function startGithubConnect(workspaceId: string) {
  return unwrap<{ installUrl: string }>(
    api.post(`/workspaces/${workspaceId}/sources/github/connect`),
  );
}

export function getSource(sourceId: string) {
  return unwrap<SourceDetail>(api.get(`/sources/${sourceId}`));
}

export function listGithubSourceRepositories(sourceId: string) {
  return unwrap<GithubRepositoryOption[]>(api.get(`/sources/${sourceId}/github/repositories`));
}

export function listGithubSourceBranches(sourceId: string, repo: string) {
  return unwrap<string[]>(api.get(`/sources/${sourceId}/github/branches`, { params: { repo } }));
}

export function updateSource(sourceId: string, input: Record<string, unknown>) {
  return unwrap(api.patch(`/sources/${sourceId}`, input));
}

export function deleteSource(sourceId: string) {
  return unwrap(api.delete(`/sources/${sourceId}`));
}

export interface SourceResource {
  id: string;
  name: string;
  kind: string;
  status: string;
  gitRepository: string | null;
  gitBranch: string | null;
  projectId: string;
  projectName: string;
}

export function listSourceResources(sourceId: string) {
  return unwrap<SourceResource[]>(api.get(`/sources/${sourceId}/resources`));
}
