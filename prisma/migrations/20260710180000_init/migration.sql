-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'BILLING_ADMIN', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'RESET_PASSWORD', 'EMAIL_CHANGE');

-- CreateEnum
CREATE TYPE "ProxyType" AS ENUM ('TRAEFIK', 'CADDY', 'NONE');

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('GIT_APP', 'DOCKERFILE', 'DOCKER_IMAGE', 'STATIC', 'NIXPACKS', 'DATABASE', 'COMPOSE');

-- CreateEnum
CREATE TYPE "BuildPack" AS ENUM ('NIXPACKS', 'STATIC', 'DOCKERFILE', 'DOCKERCOMPOSE', 'DOCKERIMAGE', 'RAILPACK');

-- CreateEnum
CREATE TYPE "DatabaseEngine" AS ENUM ('POSTGRESQL', 'MYSQL', 'MARIADB', 'MONGODB', 'REDIS', 'KEYDB', 'DRAGONFLY', 'CLICKHOUSE');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('RUNNING', 'STARTING', 'STOPPED', 'DEGRADED', 'EXITED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GitSourceType" AS ENUM ('PUBLIC', 'GITHUB_APP', 'DEPLOY_KEY', 'GITLAB_APP');

-- CreateEnum
CREATE TYPE "SharedVariableScope" AS ENUM ('WORKSPACE', 'PROJECT', 'SERVER');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'FINISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('EMAIL', 'DISCORD', 'SLACK', 'TELEGRAM', 'PUSHOVER', 'WEBHOOK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "profilePicture" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "isInstanceAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorRecoveryCodes" TEXT,
    "twoFactorConfirmedAt" TIMESTAMP(3),
    "pendingEmail" TEXT,
    "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "showOnboarding" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAccessToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "abilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSetting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wildcardDomain" TEXT,

    CONSTRAINT "ProjectSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMembership" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInvitation" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateKey" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT,
    "fingerprint" TEXT,
    "isGitRelated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "user" TEXT NOT NULL DEFAULT 'root',
    "privateKeyId" TEXT,
    "proxyType" "ProxyType" NOT NULL DEFAULT 'TRAEFIK',
    "proxyStatus" TEXT NOT NULL DEFAULT 'exited',
    "proxyConfig" JSONB,
    "isBuildServer" BOOLEAN NOT NULL DEFAULT false,
    "isSwarmManager" BOOLEAN NOT NULL DEFAULT false,
    "isSwarmWorker" BOOLEAN NOT NULL DEFAULT false,
    "isReachable" BOOLEAN NOT NULL DEFAULT false,
    "isUsable" BOOLEAN NOT NULL DEFAULT false,
    "highDiskUsage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerOperationLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "sessionId" TEXT,
    "operation" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSetting" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "wildcardDomain" TEXT,
    "isReachable" BOOLEAN NOT NULL DEFAULT false,
    "isUsable" BOOLEAN NOT NULL DEFAULT false,
    "forceDisabled" BOOLEAN NOT NULL DEFAULT false,
    "concurrentBuilds" INTEGER NOT NULL DEFAULT 2,
    "deploymentQueueLimit" INTEGER NOT NULL DEFAULT 25,
    "connectionTimeout" INTEGER NOT NULL DEFAULT 30,
    "isMetricsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isSentinelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sentinelToken" TEXT,
    "isTerminalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isCloudflareTunnel" BOOLEAN NOT NULL DEFAULT false,
    "isJumpServer" BOOLEAN NOT NULL DEFAULT false,
    "forceDockerCleanup" BOOLEAN NOT NULL DEFAULT false,
    "dockerCleanupFrequency" TEXT NOT NULL DEFAULT '0 0 * * *',
    "dockerCleanupThreshold" INTEGER NOT NULL DEFAULT 80,
    "deleteUnusedVolumes" BOOLEAN NOT NULL DEFAULT false,
    "deleteUnusedNetworks" BOOLEAN NOT NULL DEFAULT false,
    "diskUsageNotificationThreshold" INTEGER NOT NULL DEFAULT 80,
    "logDrainConfig" JSONB,

    CONSTRAINT "ServerSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DockerDestination" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'peon',
    "isSwarm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DockerDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubApp" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "apiUrl" TEXT NOT NULL DEFAULT 'https://api.github.com',
    "htmlUrl" TEXT NOT NULL DEFAULT 'https://github.com',
    "customUser" TEXT NOT NULL DEFAULT 'git',
    "customPort" INTEGER NOT NULL DEFAULT 22,
    "appId" TEXT,
    "installationId" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "webhookSecret" TEXT,
    "privateKeyId" TEXT,
    "isSystemWide" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitlabApp" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "apiUrl" TEXT NOT NULL DEFAULT 'https://gitlab.com/api/v4',
    "htmlUrl" TEXT NOT NULL DEFAULT 'https://gitlab.com',
    "customUser" TEXT NOT NULL DEFAULT 'git',
    "customPort" INTEGER NOT NULL DEFAULT 22,
    "appId" TEXT,
    "appSecret" TEXT,
    "oauthId" INTEGER,
    "groupName" TEXT,
    "webhookToken" TEXT,
    "privateKeyId" TEXT,
    "isSystemWide" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitlabApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ServiceKind" NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "serverId" TEXT,
    "destinationId" TEXT,
    "fqdn" TEXT,
    "ports" TEXT,
    "buildPack" "BuildPack",
    "gitRepository" TEXT,
    "gitBranch" TEXT,
    "gitCommitSha" TEXT,
    "gitSourceType" "GitSourceType",
    "baseDirectory" TEXT NOT NULL DEFAULT '/',
    "publishDirectory" TEXT,
    "installCommand" TEXT,
    "buildCommand" TEXT,
    "startCommand" TEXT,
    "dockerfileContent" TEXT,
    "dockerfilePath" TEXT NOT NULL DEFAULT '/Dockerfile',
    "dockerComposeRaw" TEXT,
    "templateSlug" TEXT,
    "dockerComposeParsed" TEXT,
    "dockerRegistryImage" TEXT,
    "dockerRegistryTag" TEXT,
    "healthCheckEnabled" BOOLEAN NOT NULL DEFAULT false,
    "healthCheckPath" TEXT,
    "healthCheckPort" TEXT,
    "healthCheckMethod" TEXT NOT NULL DEFAULT 'GET',
    "healthCheckScheme" TEXT NOT NULL DEFAULT 'http',
    "healthCheckHost" TEXT NOT NULL DEFAULT 'localhost',
    "healthCheckReturnCode" INTEGER NOT NULL DEFAULT 200,
    "healthCheckResponseText" TEXT,
    "healthCheckInterval" INTEGER NOT NULL DEFAULT 5,
    "healthCheckTimeout" INTEGER NOT NULL DEFAULT 5,
    "healthCheckRetries" INTEGER NOT NULL DEFAULT 10,
    "healthCheckStartPeriod" INTEGER NOT NULL DEFAULT 5,
    "githubAppId" TEXT,
    "gitlabAppId" TEXT,
    "privateKeyId" TEXT,
    "databaseEngine" "DatabaseEngine",
    "databaseImage" TEXT,
    "databasePublic" BOOLEAN NOT NULL DEFAULT false,
    "databasePublicPort" INTEGER,
    "dbUsername" TEXT,
    "dbPassword" TEXT,
    "dbName" TEXT,
    "dbRootPassword" TEXT,
    "dbInitScript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSetting" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "isAutoDeployEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isPreviewDeploymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isForceHttpsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isGzipEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isStripprefixEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isStatic" BOOLEAN NOT NULL DEFAULT false,
    "isSpa" BOOLEAN NOT NULL DEFAULT false,
    "isBuildServerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "disableBuildCache" BOOLEAN NOT NULL DEFAULT false,
    "isGitSubmodulesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isGitLfsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isConsistentContainerNameEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isRawComposeDeploymentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "connectToDockerNetwork" BOOLEAN NOT NULL DEFAULT false,
    "customDockerRunOptions" TEXT,
    "preDeployCommand" TEXT,
    "postDeployCommand" TEXT,
    "customLabels" TEXT,
    "watchPaths" TEXT,
    "dockerImagesToKeep" INTEGER NOT NULL DEFAULT 3,
    "stopGracePeriod" INTEGER NOT NULL DEFAULT 30,
    "cpuLimit" TEXT,
    "memoryLimit" TEXT,

    CONSTRAINT "ServiceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentVariable" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "isBuildtime" BOOLEAN NOT NULL DEFAULT true,
    "isRuntime" BOOLEAN NOT NULL DEFAULT true,
    "isMultiline" BOOLEAN NOT NULL DEFAULT false,
    "isLiteral" BOOLEAN NOT NULL DEFAULT false,
    "isShownOnce" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedEnvironmentVariable" (
    "id" TEXT NOT NULL,
    "scope" "SharedVariableScope" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "comment" TEXT,
    "isMultiline" BOOLEAN NOT NULL DEFAULT false,
    "isLiteral" BOOLEAN NOT NULL DEFAULT false,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "serverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedEnvironmentVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistentVolume" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mountPath" TEXT NOT NULL,
    "hostPath" TEXT,
    "isBindMount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersistentVolume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'QUEUED',
    "commitSha" TEXT,
    "commitMessage" TEXT,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "pullRequestId" INTEGER,
    "forceRebuild" BOOLEAN NOT NULL DEFAULT false,
    "restartOnly" BOOLEAN NOT NULL DEFAULT false,
    "logs" JSONB,
    "previewImagePath" TEXT,
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePreview" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "pullRequestId" INTEGER NOT NULL,
    "fqdn" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceWebhook" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'generic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "container" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 300,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskExecution" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "message" TEXT,
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledTaskExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "S3Storage" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "endpoint" TEXT,
    "bucket" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "isUsable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "S3Storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledBackup" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL,
    "description" TEXT,
    "saveS3" BOOLEAN NOT NULL DEFAULT false,
    "s3StorageId" TEXT,
    "disableLocal" BOOLEAN NOT NULL DEFAULT false,
    "dumpAll" BOOLEAN NOT NULL DEFAULT false,
    "databasesToBackup" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 3600,
    "retentionAmountLocal" INTEGER NOT NULL DEFAULT 7,
    "retentionDaysLocal" INTEGER NOT NULL DEFAULT 0,
    "retentionAmountS3" INTEGER NOT NULL DEFAULT 0,
    "retentionDaysS3" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledBackupExecution" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "message" TEXT,
    "size" TEXT,
    "filename" TEXT,
    "databaseName" TEXT,
    "s3Uploaded" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledBackupExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" "NotificationChannelType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagsOnServices" (
    "tagId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "TagsOnServices_pkey" PRIMARY KEY ("tagId","serviceId")
);

-- CreateTable
CREATE TABLE "CloudProviderToken" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'hetzner',
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudProviderToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudInitScript" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudInitScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SslCertificate" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "serverId" TEXT,
    "commonName" TEXT,
    "certificate" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "isCaCertificate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SslCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePlanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "instanceName" TEXT NOT NULL DEFAULT 'Peon',
    "fqdn" TEXT,
    "publicIpv4" TEXT,
    "publicIpv6" TEXT,
    "isRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isApiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDnsValidationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customDnsServers" TEXT NOT NULL DEFAULT '1.1.1.1,8.8.8.8',
    "publicPortMin" INTEGER NOT NULL DEFAULT 9000,
    "publicPortMax" INTEGER NOT NULL DEFAULT 9100,
    "instanceTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "emailConfig" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthSetting" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "redirectUri" TEXT,
    "tenant" TEXT,
    "baseUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OauthSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "EmailOtp_email_purpose_idx" ON "EmailOtp"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key" ON "WorkspaceMembership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_tokenHash_key" ON "PersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_userId_idx" ON "PersonalAccessToken"("userId");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_workspaceId_idx" ON "PersonalAccessToken"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_uuid_key" ON "Project"("uuid");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSetting_projectId_key" ON "ProjectSetting"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMembership_userId_idx" ON "ProjectMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMembership_projectId_userId_key" ON "ProjectMembership"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_uuid_key" ON "WorkspaceInvitation"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvitation_email_idx" ON "WorkspaceInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvitation_workspaceId_email_key" ON "WorkspaceInvitation"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvitation_uuid_key" ON "ProjectInvitation"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvitation_token_key" ON "ProjectInvitation"("token");

-- CreateIndex
CREATE INDEX "ProjectInvitation_email_idx" ON "ProjectInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvitation_projectId_email_key" ON "ProjectInvitation"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateKey_uuid_key" ON "PrivateKey"("uuid");

-- CreateIndex
CREATE INDEX "PrivateKey_workspaceId_idx" ON "PrivateKey"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_uuid_key" ON "Server"("uuid");

-- CreateIndex
CREATE INDEX "Server_workspaceId_idx" ON "Server"("workspaceId");

-- CreateIndex
CREATE INDEX "ServerOperationLog_serverId_createdAt_idx" ON "ServerOperationLog"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "ServerOperationLog_serverId_sessionId_createdAt_idx" ON "ServerOperationLog"("serverId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServerSetting_serverId_key" ON "ServerSetting"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "DockerDestination_uuid_key" ON "DockerDestination"("uuid");

-- CreateIndex
CREATE INDEX "DockerDestination_serverId_idx" ON "DockerDestination"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubApp_uuid_key" ON "GithubApp"("uuid");

-- CreateIndex
CREATE INDEX "GithubApp_workspaceId_idx" ON "GithubApp"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "GitlabApp_uuid_key" ON "GitlabApp"("uuid");

-- CreateIndex
CREATE INDEX "GitlabApp_workspaceId_idx" ON "GitlabApp"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_uuid_key" ON "Service"("uuid");

-- CreateIndex
CREATE INDEX "Service_projectId_idx" ON "Service"("projectId");

-- CreateIndex
CREATE INDEX "Service_serverId_idx" ON "Service"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSetting_serviceId_key" ON "ServiceSetting"("serviceId");

-- CreateIndex
CREATE INDEX "EnvironmentVariable_serviceId_idx" ON "EnvironmentVariable"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentVariable_serviceId_key_isPreview_key" ON "EnvironmentVariable"("serviceId", "key", "isPreview");

-- CreateIndex
CREATE INDEX "SharedEnvironmentVariable_workspaceId_scope_idx" ON "SharedEnvironmentVariable"("workspaceId", "scope");

-- CreateIndex
CREATE INDEX "PersistentVolume_serviceId_idx" ON "PersistentVolume"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_uuid_key" ON "Deployment"("uuid");

-- CreateIndex
CREATE INDEX "Deployment_serviceId_idx" ON "Deployment"("serviceId");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePreview_uuid_key" ON "ServicePreview"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePreview_serviceId_pullRequestId_key" ON "ServicePreview"("serviceId", "pullRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceWebhook_token_key" ON "ServiceWebhook"("token");

-- CreateIndex
CREATE INDEX "ServiceWebhook_serviceId_idx" ON "ServiceWebhook"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTask_uuid_key" ON "ScheduledTask"("uuid");

-- CreateIndex
CREATE INDEX "ScheduledTask_serviceId_idx" ON "ScheduledTask"("serviceId");

-- CreateIndex
CREATE INDEX "ScheduledTaskExecution_taskId_idx" ON "ScheduledTaskExecution"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "S3Storage_uuid_key" ON "S3Storage"("uuid");

-- CreateIndex
CREATE INDEX "S3Storage_workspaceId_idx" ON "S3Storage"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledBackup_uuid_key" ON "ScheduledBackup"("uuid");

-- CreateIndex
CREATE INDEX "ScheduledBackup_serviceId_idx" ON "ScheduledBackup"("serviceId");

-- CreateIndex
CREATE INDEX "ScheduledBackupExecution_backupId_idx" ON "ScheduledBackupExecution"("backupId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannel_workspaceId_channel_key" ON "NotificationChannel"("workspaceId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CloudProviderToken_uuid_key" ON "CloudProviderToken"("uuid");

-- CreateIndex
CREATE INDEX "CloudProviderToken_workspaceId_idx" ON "CloudProviderToken"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CloudInitScript_uuid_key" ON "CloudInitScript"("uuid");

-- CreateIndex
CREATE INDEX "CloudInitScript_workspaceId_idx" ON "CloudInitScript"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SslCertificate_uuid_key" ON "SslCertificate"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthSetting_provider_key" ON "OauthSetting"("provider");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAccessToken" ADD CONSTRAINT "PersonalAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAccessToken" ADD CONSTRAINT "PersonalAccessToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSetting" ADD CONSTRAINT "ProjectSetting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateKey" ADD CONSTRAINT "PrivateKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_privateKeyId_fkey" FOREIGN KEY ("privateKeyId") REFERENCES "PrivateKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerOperationLog" ADD CONSTRAINT "ServerOperationLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSetting" ADD CONSTRAINT "ServerSetting_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockerDestination" ADD CONSTRAINT "DockerDestination_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubApp" ADD CONSTRAINT "GithubApp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubApp" ADD CONSTRAINT "GithubApp_privateKeyId_fkey" FOREIGN KEY ("privateKeyId") REFERENCES "PrivateKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitlabApp" ADD CONSTRAINT "GitlabApp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitlabApp" ADD CONSTRAINT "GitlabApp_privateKeyId_fkey" FOREIGN KEY ("privateKeyId") REFERENCES "PrivateKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "DockerDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_githubAppId_fkey" FOREIGN KEY ("githubAppId") REFERENCES "GithubApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_gitlabAppId_fkey" FOREIGN KEY ("gitlabAppId") REFERENCES "GitlabApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_privateKeyId_fkey" FOREIGN KEY ("privateKeyId") REFERENCES "PrivateKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSetting" ADD CONSTRAINT "ServiceSetting_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentVariable" ADD CONSTRAINT "EnvironmentVariable_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedEnvironmentVariable" ADD CONSTRAINT "SharedEnvironmentVariable_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedEnvironmentVariable" ADD CONSTRAINT "SharedEnvironmentVariable_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersistentVolume" ADD CONSTRAINT "PersistentVolume_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePreview" ADD CONSTRAINT "ServicePreview_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceWebhook" ADD CONSTRAINT "ServiceWebhook_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskExecution" ADD CONSTRAINT "ScheduledTaskExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "S3Storage" ADD CONSTRAINT "S3Storage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledBackup" ADD CONSTRAINT "ScheduledBackup_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledBackup" ADD CONSTRAINT "ScheduledBackup_s3StorageId_fkey" FOREIGN KEY ("s3StorageId") REFERENCES "S3Storage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledBackupExecution" ADD CONSTRAINT "ScheduledBackupExecution_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "ScheduledBackup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnServices" ADD CONSTRAINT "TagsOnServices_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnServices" ADD CONSTRAINT "TagsOnServices_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudProviderToken" ADD CONSTRAINT "CloudProviderToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudInitScript" ADD CONSTRAINT "CloudInitScript_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
