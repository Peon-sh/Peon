import { api, unwrap } from '@/lib/http/axios';

export type DeploymentStatus = 'QUEUED' | 'IN_PROGRESS' | 'FINISHED' | 'FAILED' | 'CANCELLED';

export interface LogLine {
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
}

export interface DeploymentListItem {
  id: string;
  uuid: string;
  status: DeploymentStatus;
  commitSha: string | null;
  commitMessage: string | null;
  isPreview: boolean;
  pullRequestId: number | null;
  /** Preview site URL when isPreview (from commit sha + server wildcard). */
  previewUrl: string | null;
  forceRebuild: boolean;
  restartOnly: boolean;
  triggeredBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  hasPreview: boolean;
}

export interface DeploymentDetail extends DeploymentListItem {
  logs: LogLine[];
  service: { id: string; name: string; projectId: string };
}

export interface ActiveDeploymentItem {
  id: string;
  uuid: string;
  status: DeploymentStatus;
  commitSha: string | null;
  commitMessage: string | null;
  isPreview: boolean;
  startedAt: string | null;
  createdAt: string;
  service: { id: string; name: string; projectId: string };
  project: { id: string; name: string };
}

export function listDeployments(serviceId: string) {
  return unwrap<DeploymentListItem[]>(api.get(`/services/${serviceId}/deployments`));
}

export function listActiveDeployments(workspaceId: string) {
  return unwrap<ActiveDeploymentItem[]>(
    api.get(`/workspaces/${workspaceId}/deployments/active`),
  );
}

export function getDeployment(deploymentId: string) {
  return unwrap<DeploymentDetail>(api.get(`/deployments/${deploymentId}`));
}

export function cancelDeployment(deploymentId: string) {
  return unwrap<DeploymentDetail>(api.post(`/deployments/${deploymentId}/cancel`));
}

export function deploymentPreviewUrl(deploymentId: string) {
  return `/api/deployments/${deploymentId}/preview`;
}
