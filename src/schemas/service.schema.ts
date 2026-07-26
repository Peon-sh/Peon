import { z } from 'zod';
import { ENV_VAR_KEY, MAX_ENV_VAR_KEY_LENGTH } from '@/lib/env-var-key';
import { isSafeGitRefName, MAX_GIT_REF_LENGTH } from '@/lib/git/ref';

/**
 * Create/update validation for services.
 * Kind ↔ buildPack invariants: see docs/SERVICE_KIND_INVARIANTS.md
 */

/** A branch name reaches git on the deploy host — keep it a plain refname. */
const gitBranchSchema = z
  .string()
  .min(1)
  .max(MAX_GIT_REF_LENGTH)
  .refine(isSafeGitRefName, {
    message: 'Branch name contains forbidden characters.',
  });

export const serviceKindEnum = z.enum([
  'GIT_APP',
  'DOCKERFILE',
  'DOCKER_IMAGE',
  'STATIC',
  'NIXPACKS',
  'DATABASE',
  'COMPOSE',
]);

export const buildPackEnum = z.enum([
  'NIXPACKS',
  'STATIC',
  'DOCKERFILE',
  'DOCKERCOMPOSE',
  'DOCKERIMAGE',
  'RAILPACK',
]);

export const databaseEngineEnum = z.enum([
  'POSTGRESQL',
  'MYSQL',
  'MARIADB',
  'MONGODB',
  'REDIS',
  'KEYDB',
  'DRAGONFLY',
  'CLICKHOUSE',
]);

export const gitSourceTypeEnum = z.enum(['PUBLIC', 'GITHUB_APP', 'DEPLOY_KEY', 'GITLAB_APP']);

const baseFields = {
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  serverId: z.string().min(1),
  destinationId: z.string().min(1).optional(),
};

const gitFields = {
  gitRepository: z.string().min(1),
  /** GitHub numeric repository id for App webhook matching. */
  repositoryProjectId: z.number().int().positive().optional(),
  gitBranch: gitBranchSchema.default('main'),
  gitSourceType: gitSourceTypeEnum.default('PUBLIC'),
  githubAppId: z.string().min(1).optional(),
  gitlabAppId: z.string().min(1).optional(),
  privateKeyId: z.string().min(1).optional(),
  baseDirectory: z.string().default('/'),
  ports: z.string().optional(),
  publishDirectory: z.string().optional(),
};

export const createServiceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('GIT_APP'),
    ...baseFields,
    ...gitFields,
    buildPack: z.enum(['NIXPACKS', 'STATIC', 'DOCKERFILE', 'RAILPACK']).default('NIXPACKS'),
    dockerfilePath: z.string().optional(),
    dockerfileContent: z.string().optional(),
  }),
  z.object({
    kind: z.literal('DOCKERFILE'),
    ...baseFields,
    ...gitFields,
    dockerfileContent: z.string().optional(),
    dockerfilePath: z.string().default('/Dockerfile'),
  }),
  z.object({
    kind: z.literal('NIXPACKS'),
    ...baseFields,
    ...gitFields,
  }),
  z.object({
    kind: z.literal('STATIC'),
    ...baseFields,
    ...gitFields,
  }),
  z.object({
    kind: z.literal('DOCKER_IMAGE'),
    ...baseFields,
    dockerRegistryImage: z.string().min(1),
    dockerRegistryTag: z.string().default('latest'),
    ports: z.string().optional(),
  }),
  z.object({
    kind: z.literal('COMPOSE'),
    ...baseFields,
    dockerComposeRaw: z.string().min(1),
  }),
  z.object({
    kind: z.literal('DATABASE'),
    ...baseFields,
    databaseEngine: databaseEngineEnum,
    databaseImage: z.string().optional(),
    dbName: z.string().optional(),
    dbUsername: z.string().optional(),
  }),
]);

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  serverId: z.string().min(1).nullable().optional(),
  destinationId: z.string().min(1).nullable().optional(),
  fqdn: z.string().nullable().optional(),
  ports: z.string().nullable().optional(),
  buildPack: buildPackEnum.nullable().optional(),
  gitRepository: z.string().nullable().optional(),
  repositoryProjectId: z.number().int().positive().nullable().optional(),
  gitBranch: gitBranchSchema.nullable().optional(),
  gitSourceType: gitSourceTypeEnum.nullable().optional(),
  githubAppId: z.string().nullable().optional(),
  gitlabAppId: z.string().nullable().optional(),
  privateKeyId: z.string().nullable().optional(),
  baseDirectory: z.string().optional(),
  publishDirectory: z.string().nullable().optional(),
  installCommand: z.string().nullable().optional(),
  buildCommand: z.string().nullable().optional(),
  startCommand: z.string().nullable().optional(),
  dockerfileContent: z.string().nullable().optional(),
  dockerfilePath: z.string().optional(),
  dockerComposeRaw: z.string().nullable().optional(),
  dockerRegistryImage: z.string().nullable().optional(),
  dockerRegistryTag: z.string().nullable().optional(),
  healthCheckEnabled: z.boolean().optional(),
  healthCheckPath: z.string().nullable().optional(),
  healthCheckPort: z.string().nullable().optional(),
  healthCheckMethod: z.string().optional(),
  healthCheckScheme: z.enum(['http', 'https']).optional(),
  healthCheckHost: z.string().optional(),
  healthCheckReturnCode: z.number().int().min(100).max(599).optional(),
  healthCheckResponseText: z.string().nullable().optional(),
  healthCheckInterval: z.number().int().min(1).max(3600).optional(),
  healthCheckTimeout: z.number().int().min(1).max(3600).optional(),
  healthCheckRetries: z.number().int().min(1).max(100).optional(),
  healthCheckStartPeriod: z.number().int().min(0).max(3600).optional(),
  databaseImage: z.string().nullable().optional(),
  databasePublic: z.boolean().optional(),
  databasePublicPort: z.number().int().nullable().optional(),
  dbInitScript: z.string().nullable().optional(),
  isAutoDeployEnabled: z.boolean().optional(),
  isPreviewDeploymentsEnabled: z.boolean().optional(),
  isForceHttpsEnabled: z.boolean().optional(),
  isGzipEnabled: z.boolean().optional(),
  isStripprefixEnabled: z.boolean().optional(),
  isStatic: z.boolean().optional(),
  isSpa: z.boolean().optional(),
  disableBuildCache: z.boolean().optional(),
  isConsistentContainerNameEnabled: z.boolean().optional(),
  isRawComposeDeploymentEnabled: z.boolean().optional(),
  rollingUpdate: z.boolean().optional(),
  customDockerRunOptions: z.string().nullable().optional(),
  preDeployCommand: z.string().nullable().optional(),
  postDeployCommand: z.string().nullable().optional(),
  customLabels: z.string().nullable().optional(),
  watchPaths: z.string().nullable().optional(),
  dockerImagesToKeep: z.number().int().optional(),
  stopGracePeriod: z.number().int().optional(),
  cpuLimit: z.string().nullable().optional(),
  memoryLimit: z.string().nullable().optional(),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const upsertEnvSchema = z.object({
  key: z.string().min(1).max(MAX_ENV_VAR_KEY_LENGTH).regex(ENV_VAR_KEY, 'Invalid env var key'),
  value: z.string().default(''),
  isPreview: z.boolean().default(false),
  isBuildtime: z.boolean().default(true),
  isRuntime: z.boolean().default(true),
  isMultiline: z.boolean().default(false),
  isLiteral: z.boolean().default(false),
  comment: z.string().nullable().optional(),
});

export type UpsertEnvInput = z.infer<typeof upsertEnvSchema>;

export const upsertTaskSchema = z.object({
  name: z.string().min(1).max(120),
  command: z.string().min(1),
  frequency: z.string().min(1), // 5-field cron
  container: z.string().nullable().optional(),
  timeout: z.number().int().min(1).max(86400).default(300),
  enabled: z.boolean().default(true),
});

export type UpsertTaskInput = z.infer<typeof upsertTaskSchema>;

export const upsertBackupSchema = z.object({
  frequency: z.string().min(1), // 5-field cron
  enabled: z.boolean().default(true),
  saveS3: z.boolean().default(false),
  s3StorageId: z.string().nullable().optional(),
  retentionAmountLocal: z.number().int().min(0).max(1000).default(7),
  /** Entire instance (all DBs) vs configured database only. Default: entire instance. */
  dumpAll: z.boolean().default(true),
});

export type UpsertBackupInput = z.infer<typeof upsertBackupSchema>;

export const execCommandSchema = z.object({
  command: z.string().min(1).max(4000),
});

export type ExecCommandInput = z.infer<typeof execCommandSchema>;

export const upsertVolumeSchema = z.object({
  name: z.string().min(1).max(120),
  mountPath: z.string().min(1),
  hostPath: z.string().nullable().optional(),
  isBindMount: z.boolean().default(false),
});

export type UpsertVolumeInput = z.infer<typeof upsertVolumeSchema>;

export const createWebhookSchema = z.object({
  provider: z.enum(['generic', 'github', 'gitlab']).default('generic'),
});

export const deployOptsSchema = z.object({
  force: z.boolean().default(false),
  restartOnly: z.boolean().default(false),
});

export const controlSchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
});

export const rollbackSchema = z.object({
  deploymentId: z.string().min(1),
});
