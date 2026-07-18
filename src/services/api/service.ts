import { api, unwrap } from '@/lib/http/axios';

export type ServiceKind =
  | 'GIT_APP'
  | 'DOCKERFILE'
  | 'DOCKER_IMAGE'
  | 'STATIC'
  | 'NIXPACKS'
  | 'DATABASE'
  | 'COMPOSE';

export type ServiceStatus =
  | 'RUNNING'
  | 'STARTING'
  | 'STOPPED'
  | 'DEGRADED'
  | 'EXITED'
  | 'UNKNOWN';

export type BuildPack =
  | 'NIXPACKS'
  | 'STATIC'
  | 'DOCKERFILE'
  | 'DOCKERCOMPOSE'
  | 'DOCKERIMAGE'
  | 'RAILPACK';

export type DatabaseEngine =
  | 'POSTGRESQL'
  | 'MYSQL'
  | 'MARIADB'
  | 'MONGODB'
  | 'REDIS'
  | 'KEYDB'
  | 'DRAGONFLY'
  | 'CLICKHOUSE';

export type GitSourceType = 'PUBLIC' | 'GITHUB_APP' | 'DEPLOY_KEY' | 'GITLAB_APP';

export interface ServiceListItem {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  kind: ServiceKind;
  status: ServiceStatus;
  fqdn: string | null;
  serverId: string | null;
  databaseEngine: DatabaseEngine | null;
  createdAt: string;
  _count: { deployments: number; environmentVars: number; persistentVolumes: number };
}

export interface ServiceDetail extends ServiceListItem {
  destinationId: string | null;
  ports: string | null;
  buildPack: BuildPack | null;
  gitRepository: string | null;
  repositoryProjectId: number | null;
  gitBranch: string | null;
  gitCommitSha: string | null;
  gitSourceType: GitSourceType | null;
  baseDirectory: string;
  publishDirectory: string | null;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  dockerfileContent: string | null;
  dockerfilePath: string;
  dockerComposeRaw: string | null;
  dockerRegistryImage: string | null;
  dockerRegistryTag: string | null;
  healthCheckEnabled: boolean;
  healthCheckPath: string | null;
  healthCheckPort: string | null;
  healthCheckMethod: string;
  healthCheckScheme: string;
  healthCheckHost: string;
  healthCheckReturnCode: number;
  healthCheckResponseText: string | null;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  healthCheckRetries: number;
  healthCheckStartPeriod: number;
  activeContainerName: string | null;
  databaseImage: string | null;
  databasePublic: boolean;
  databasePublicPort: number | null;
  dbUsername: string | null;
  dbName: string | null;
  dbPassword: string | null;
  dbRootPassword: string | null;
  githubAppId: string | null;
  gitlabAppId: string | null;
  privateKeyId: string | null;
  settings: ServiceSettings | null;
  server: {
    id: string;
    name: string;
    ip: string;
    settings?: { wildcardDomain: string | null } | null;
  } | null;
  destination: { id: string; name: string; network: string } | null;
  _count: {
    deployments: number;
    environmentVars: number;
    persistentVolumes: number;
    previews: number;
    webhooks: number;
  };
}

export interface ServiceSettings {
  isAutoDeployEnabled: boolean;
  isPreviewDeploymentsEnabled: boolean;
  isForceHttpsEnabled: boolean;
  isGzipEnabled: boolean;
  isStripprefixEnabled: boolean;
  isStatic: boolean;
  isSpa: boolean;
  disableBuildCache: boolean;
  isConsistentContainerNameEnabled: boolean;
  isRawComposeDeploymentEnabled: boolean;
  rollingUpdate: boolean;
  customDockerRunOptions: string | null;
  preDeployCommand: string | null;
  postDeployCommand: string | null;
  customLabels: string | null;
  watchPaths: string | null;
  dockerImagesToKeep: number;
  stopGracePeriod: number;
  cpuLimit: string | null;
  memoryLimit: string | null;
}

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  isPreview: boolean;
  isBuildtime: boolean;
  isRuntime: boolean;
  isMultiline: boolean;
  isLiteral: boolean;
  comment: string | null;
}

export interface Volume {
  id: string;
  name: string;
  mountPath: string;
  hostPath: string | null;
  isBindMount: boolean;
  createdAt: string;
}

export interface Webhook {
  id: string;
  token: string;
  provider: string;
  createdAt: string;
}

export interface Preview {
  id: string;
  uuid: string;
  pullRequestId: number;
  fqdn: string | null;
  status: ServiceStatus;
  createdAt: string;
}

export interface ServerListItem {
  id: string;
  name: string;
  ip: string;
  settings?: { wildcardDomain: string | null } | null;
}

export function listServices(projectId: string) {
  return unwrap<ServiceListItem[]>(api.get(`/projects/${projectId}/services`));
}

export function createService(projectId: string, input: Record<string, unknown>) {
  return unwrap<{ id: string }>(api.post(`/projects/${projectId}/services`, input));
}

export function getService(serviceId: string) {
  return unwrap<ServiceDetail>(api.get(`/services/${serviceId}`));
}

export function updateService(serviceId: string, input: Record<string, unknown>) {
  return unwrap(api.patch(`/services/${serviceId}`, input));
}

export function deleteService(serviceId: string) {
  return unwrap(api.delete(`/services/${serviceId}`));
}

export function deployService(serviceId: string, input: { force?: boolean; restartOnly?: boolean } = {}) {
  return unwrap<{ id: string }>(api.post(`/services/${serviceId}/deploy`, input));
}

export function controlService(serviceId: string, action: 'start' | 'stop' | 'restart') {
  return unwrap<{ queued: true; action: typeof action; status: ServiceStatus }>(
    api.post(`/services/${serviceId}/control`, { action }),
  );
}

export function rollbackService(serviceId: string, deploymentId: string) {
  return unwrap<{ id: string }>(api.post(`/services/${serviceId}/rollback`, { deploymentId }));
}

export function listEnv(serviceId: string, reveal = false) {
  return unwrap<EnvVar[]>(api.get(`/services/${serviceId}/env${reveal ? '?reveal=true' : ''}`));
}

export function bulkSaveEnv(serviceId: string, raw: string, isPreview = false) {
  return unwrap<{ saved: number; deleted: number }>(
    api.put(`/services/${serviceId}/env/bulk`, { raw, isPreview }),
  );
}

export function upsertEnv(serviceId: string, input: Partial<EnvVar> & { key: string; value: string }) {
  return unwrap(api.post(`/services/${serviceId}/env`, input));
}

/** Copy production vars into the preview set (overwrites matching preview keys). */
export function importPreviewEnvFromProduction(serviceId: string) {
  return unwrap<{ imported: number }>(api.post(`/services/${serviceId}/env/import-preview`));
}

export function deleteEnv(serviceId: string, envId: string) {
  return unwrap(api.delete(`/services/${serviceId}/env/${envId}`));
}

export function listVolumes(serviceId: string) {
  return unwrap<Volume[]>(api.get(`/services/${serviceId}/volumes`));
}

export function createVolume(
  serviceId: string,
  input: { name: string; mountPath: string; hostPath?: string | null; isBindMount?: boolean },
) {
  return unwrap(api.post(`/services/${serviceId}/volumes`, input));
}

export function deleteVolume(serviceId: string, volumeId: string) {
  return unwrap(api.delete(`/services/${serviceId}/volumes/${volumeId}`));
}

export function listWebhooks(serviceId: string) {
  return unwrap<Webhook[]>(api.get(`/services/${serviceId}/webhooks`));
}

export function createWebhook(serviceId: string, provider = 'generic') {
  return unwrap<Webhook>(api.post(`/services/${serviceId}/webhooks`, { provider }));
}

export function deleteWebhook(serviceId: string, webhookId: string) {
  return unwrap(api.delete(`/services/${serviceId}/webhooks/${webhookId}`));
}

export function listPreviews(serviceId: string) {
  return unwrap<Preview[]>(api.get(`/services/${serviceId}/previews`));
}

export function deletePreview(serviceId: string, previewId: string) {
  return unwrap(api.delete(`/services/${serviceId}/previews/${previewId}`));
}

export interface ServiceConfigField {
  key: string;
  label: string;
  source: 'env' | 'column';
  isPassword?: boolean;
  required?: boolean;
  helper?: string;
  readonly?: boolean;
}

export interface ServiceConfigSection {
  id: string;
  title: string;
  fields: ServiceConfigField[];
}

export function getServiceConfig(serviceId: string) {
  return unwrap<{ sections: ServiceConfigSection[]; values: Record<string, string> }>(
    api.get(`/services/${serviceId}/config`),
  );
}

export function updateServiceConfig(serviceId: string, values: Record<string, string>) {
  return unwrap(api.patch(`/services/${serviceId}/config`, values));
}

export interface ScheduledBackupItem {
  id: string;
  frequency: string;
  enabled: boolean;
  saveS3: boolean;
  s3StorageId: string | null;
  s3Storage: { id: string; name: string } | null;
  retentionAmountLocal: number;
  createdAt: string;
  _count: { executions: number };
}

export interface BackupExecution {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  message: string | null;
  filename: string | null;
  databaseName: string | null;
  s3Uploaded: boolean;
  startedAt: string;
  finishedAt: string | null;
}

export function listBackups(serviceId: string) {
  return unwrap<ScheduledBackupItem[]>(api.get(`/services/${serviceId}/backups`));
}

export function createBackup(serviceId: string, input: Record<string, unknown>) {
  return unwrap<ScheduledBackupItem>(api.post(`/services/${serviceId}/backups`, input));
}

export function updateBackup(serviceId: string, backupId: string, input: Record<string, unknown>) {
  return unwrap(api.patch(`/services/${serviceId}/backups/${backupId}`, input));
}

export function deleteBackup(serviceId: string, backupId: string) {
  return unwrap(api.delete(`/services/${serviceId}/backups/${backupId}`));
}

export function runBackupNow(serviceId: string, backupId: string) {
  return unwrap(api.post(`/services/${serviceId}/backups/${backupId}/run`));
}

export function listBackupExecutions(serviceId: string, backupId: string) {
  return unwrap<BackupExecution[]>(api.get(`/services/${serviceId}/backups/${backupId}/executions`));
}

export function restoreBackup(serviceId: string, filename: string) {
  return unwrap(api.post(`/services/${serviceId}/backups/restore`, { filename }));
}

export interface ScheduledTaskItem {
  id: string;
  uuid: string;
  name: string;
  command: string;
  frequency: string;
  container: string | null;
  timeout: number;
  enabled: boolean;
  createdAt: string;
  executions: TaskExecution[];
  _count: { executions: number };
}

export interface TaskExecution {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  message: string | null;
  duration: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export function listTasks(serviceId: string) {
  return unwrap<ScheduledTaskItem[]>(api.get(`/services/${serviceId}/tasks`));
}

export function createTask(
  serviceId: string,
  input: { name: string; command: string; frequency: string; container?: string | null; timeout?: number; enabled?: boolean },
) {
  return unwrap<ScheduledTaskItem>(api.post(`/services/${serviceId}/tasks`, input));
}

export function updateTask(serviceId: string, taskId: string, input: Record<string, unknown>) {
  return unwrap(api.patch(`/services/${serviceId}/tasks/${taskId}`, input));
}

export function deleteTask(serviceId: string, taskId: string) {
  return unwrap(api.delete(`/services/${serviceId}/tasks/${taskId}`));
}

export function runTask(serviceId: string, taskId: string) {
  return unwrap<TaskExecution>(api.post(`/services/${serviceId}/tasks/${taskId}/run`));
}

export function listTaskExecutions(serviceId: string, taskId: string) {
  return unwrap<TaskExecution[]>(api.get(`/services/${serviceId}/tasks/${taskId}/executions`));
}

export function getServiceLogs(serviceId: string, tail = 200) {
  const params = tail === 0 ? { all: 'true' } : { tail };
  return unwrap<{ container: string; lines: string[] }>(
    api.get(`/services/${serviceId}/logs`, { params }),
  );
}

export function execServiceCommand(serviceId: string, command: string) {
  return unwrap<{ container: string; code: number | null; output: string }>(
    api.post(`/services/${serviceId}/exec`, { command }),
  );
}

export function warmServiceTerminal(serviceId: string) {
  return unwrap<{ container: string; ready: boolean }>(
    api.post(`/services/${serviceId}/exec/warm`),
  );
}

export interface ServiceTerminalSession {
  ticket: string;
  wsUrl: string;
  port: number;
}

export function createServiceTerminalSession(
  serviceId: string,
  input?: { cols?: number; rows?: number },
) {
  return unwrap<ServiceTerminalSession>(
    api.post(`/services/${serviceId}/terminal`, input ?? {}),
  );
}

export interface TemplateSummary {
  slug: string;
  name: string;
  slogan: string;
  documentation?: string;
  tags: string[];
  category?: string;
  port?: string;
  amdOnly?: boolean;
  armOnly?: boolean;
}

export function listTemplates(params: { search?: string; category?: string } = {}) {
  return unwrap<{ templates: TemplateSummary[]; categories: string[] }>(
    api.get('/templates', { params }),
  );
}

export function createServiceFromTemplate(
  projectId: string,
  input: { slug: string; name?: string; serverId?: string },
) {
  return unwrap<{ id: string }>(api.post(`/projects/${projectId}/services/from-template`, input));
}

export function listServers(workspaceId: string) {
  return unwrap<ServerListItem[]>(api.get(`/workspaces/${workspaceId}/servers`));
}
