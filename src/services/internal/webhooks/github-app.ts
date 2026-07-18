import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto/encryption';
import { UnauthorizedError } from '@/lib/errors';
import { isPlatformGithubConfigured, serverEnv } from '@/lib/env';
import {
  isWatchPathsTriggered,
  parseGithubPullRequestPayload,
  parseGithubPushPayload,
  shouldSkipDeploy,
  verifyGithubSignature,
} from '@/lib/webhooks/github';
import {
  findServicesForPullRequest,
  handlePreviewPullRequest,
} from '@/services/internal/deploy/preview';
import {
  assertServerCanAcceptQueuedDeployment,
  scheduleQueuedDeployment,
  ServerDeployQueueFullError,
} from '@/services/internal/deploy/server-queue';
import { SourceService } from '@/services/internal/sources/sources';
import { setAuditActor } from '@/services/internal/audit/context';

function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    // Allow plaintext secrets saved before encryption was enforced.
    return value;
  }
}

export type GithubAppWebhookResult = {
  triggered: boolean;
  reason?: string;
  deployments?: Array<{ serviceId: string; serviceName: string; deploymentId: string }>;
  skipped?: Array<{ serviceId: string; serviceName: string; reason: string }>;
};

function parsePayload(rawBody: string): Record<string, unknown> {
  try {
    return rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  installationTargetId: string | null,
  githubApps: Array<{ webhookSecret: string | null }>,
): boolean {
  const env = serverEnv();
  if (
    installationTargetId &&
    isPlatformGithubConfigured(env) &&
    env.GITHUB_APP_ID === installationTargetId &&
    env.GITHUB_APP_WEBHOOK_SECRET
  ) {
    if (verifyGithubSignature(rawBody, signature, env.GITHUB_APP_WEBHOOK_SECRET)) {
      return true;
    }
  }

  for (const githubApp of githubApps) {
    const webhookSecret = decryptSecret(githubApp.webhookSecret);
    if (!webhookSecret) continue;
    if (verifyGithubSignature(rawBody, signature, webhookSecret)) {
      return true;
    }
  }

  return false;
}

/**
 * GitHub App webhook: one App webhook URL fans out to every
 * service that uses this App + matching repo id + branch.
 */
export async function handleGithubAppEvents(opts: {
  rawBody: string;
  event: string | null;
  signature: string | null;
  installationTargetId: string | null;
}): Promise<GithubAppWebhookResult> {
  const { rawBody, event, signature, installationTargetId } = opts;

  if (!installationTargetId) {
    throw new UnauthorizedError('Missing GitHub App installation target id.');
  }

  const githubApps = await prisma.githubApp.findMany({
    where: { appId: installationTargetId },
  });

  // Always verify signature first — including ping — so a wrong webhook secret
  // fails loudly in GitHub's delivery UI instead of looking healthy on ping.
  if (!verifyWebhookSignature(rawBody, signature, installationTargetId, githubApps)) {
    throw new UnauthorizedError('Invalid GitHub signature.');
  }

  if (event === 'ping') {
    return { triggered: false, reason: 'ping acknowledged' };
  }

  const payload = parsePayload(rawBody);

  if (event === 'installation') {
    return handleInstallationEvent(payload);
  }

  if (event === 'installation_repositories') {
    return { triggered: false, reason: 'installation_repositories acknowledged' };
  }

  if (event === 'pull_request') {
    return handlePullRequestEvent({ payload, githubApps });
  }

  if (event === 'push') {
    return handlePushEvent({ payload, githubApps });
  }

  return { triggered: false, reason: event ? `event ${event} not supported` : 'missing event' };
}

async function handleInstallationEvent(payload: Record<string, unknown>): Promise<GithubAppWebhookResult> {
  const action = typeof payload.action === 'string' ? payload.action : undefined;
  const installation = (payload.installation ?? null) as Record<string, unknown> | null;
  const installationId = installation?.id != null ? String(installation.id) : '';
  const account = (installation?.account ?? null) as Record<string, unknown> | null;
  const organization = typeof account?.login === 'string' ? account.login : null;
  const accountType = typeof account?.type === 'string' ? account.type : null;

  if (!installationId) {
    return { triggered: false, reason: 'installation event missing installation id' };
  }

  if (action === 'deleted') {
    await SourceService.setInstallationStatus(installationId, 'DISCONNECTED', organization, accountType);
    return { triggered: false, reason: 'installation disconnected' };
  }

  if (action === 'suspend') {
    await SourceService.setInstallationStatus(installationId, 'SUSPENDED', organization, accountType);
    return { triggered: false, reason: 'installation suspended' };
  }

  if (action === 'unsuspend' || action === 'created') {
    await SourceService.setInstallationStatus(installationId, 'CONNECTED', organization, accountType);
    return { triggered: false, reason: 'installation acknowledged' };
  }

  return { triggered: false, reason: 'installation event acknowledged' };
}

async function handlePullRequestEvent(opts: {
  payload: Record<string, unknown>;
  githubApps: Array<{ id: string }>;
}): Promise<GithubAppWebhookResult> {
  const pr = parseGithubPullRequestPayload(opts.payload);
  if (!pr.repositoryId || !pr.fullName || !pr.baseBranch) {
    return { triggered: false, reason: 'missing repository or base branch in pull_request payload' };
  }

  const services = await findServicesForPullRequest({
    githubAppIds: opts.githubApps.map((app) => app.id),
    repositoryProjectId: pr.repositoryId,
    fullName: pr.fullName,
    baseBranch: pr.baseBranch,
  });

  if (services.length === 0) {
    return {
      triggered: false,
      reason: `no preview-enabled services matched repo ${pr.fullName} base ${pr.baseBranch}`,
    };
  }

  const { deployments, skipped } = await handlePreviewPullRequest({ pr, services });

  return {
    triggered: deployments.length > 0,
    reason: deployments.length === 0 ? 'no preview deployments queued' : undefined,
    deployments,
    skipped: skipped.length ? skipped : undefined,
  };
}

async function handlePushEvent(opts: {
  payload: Record<string, unknown>;
  githubApps: Array<{ id: string }>;
}): Promise<GithubAppWebhookResult> {
  const push = parseGithubPushPayload(opts.payload);
  if (!push.branch || push.repositoryId == null || !push.fullName) {
    return { triggered: false, reason: 'missing branch or repository in payload' };
  }

  if (shouldSkipDeploy(push.commitMessages)) {
    return { triggered: false, reason: 'all commits contain [skip ci] or [skip cd]' };
  }

  const services = await findServicesForPush({
    githubAppIds: opts.githubApps.map((app) => app.id),
    repositoryProjectId: push.repositoryId,
    fullName: push.fullName,
    branch: push.branch,
  });

  if (services.length === 0) {
    return {
      triggered: false,
      reason: `no services matched repo ${push.fullName} branch ${push.branch}`,
    };
  }

  const deployments: GithubAppWebhookResult['deployments'] = [];
  const skipped: NonNullable<GithubAppWebhookResult['skipped']> = [];

  for (const svc of services) {
    if (svc.settings?.isAutoDeployEnabled === false) {
      skipped.push({ serviceId: svc.id, serviceName: svc.name, reason: 'auto-deploy disabled' });
      continue;
    }
    if (!isWatchPathsTriggered(svc.settings?.watchPaths, push.changedFiles)) {
      skipped.push({ serviceId: svc.id, serviceName: svc.name, reason: 'watch paths not matched' });
      continue;
    }

    // Respect server concurrentBuilds / queue limit (same path as UI deploy).
    if (svc.serverId) {
      try {
        await assertServerCanAcceptQueuedDeployment(svc.serverId);
      } catch (err) {
        if (err instanceof ServerDeployQueueFullError) {
          skipped.push({
            serviceId: svc.id,
            serviceName: svc.name,
            reason: 'deployment queue full',
          });
          continue;
        }
        throw err;
      }
    }

    const deployment = await prisma.deployment.create({
      data: {
        serviceId: svc.id,
        status: 'QUEUED',
        triggeredBy: 'webhook',
        commitSha: push.commitSha ?? null,
        commitMessage: push.commitMessage ?? null,
      },
    });
    await scheduleQueuedDeployment({
      deploymentId: deployment.id,
      serviceId: svc.id,
      serverId: svc.serverId,
      kind: svc.kind,
    });
    setAuditActor({ actorType: 'WEBHOOK' });
    const { recordServiceAudit } = await import('@/services/internal/audit/service-audit');
    await recordServiceAudit(svc.id, {
      action: 'service.deploy',
      summary: `Webhook queued deploy for "${svc.name}"`,
      metadata: { deploymentId: deployment.id, trigger: 'github' },
    });
    deployments.push({
      serviceId: svc.id,
      serviceName: svc.name,
      deploymentId: deployment.id,
    });
  }

  return {
    triggered: deployments.length > 0,
    reason: deployments.length === 0 ? 'no deployments queued' : undefined,
    deployments,
    skipped: skipped.length ? skipped : undefined,
  };
}

async function findServicesForPush(opts: {
  githubAppIds: string[];
  repositoryProjectId: number;
  fullName: string;
  branch: string;
}) {
  const byId = await prisma.service.findMany({
    where: {
      githubAppId: { in: opts.githubAppIds },
      repositoryProjectId: opts.repositoryProjectId,
      gitBranch: opts.branch,
      deletedAt: null,
    },
    include: { settings: true },
  });
  if (byId.length > 0) return byId;

  // Back-compat: services created before repositoryProjectId existed.
  const byUrl = await prisma.service.findMany({
    where: {
      githubAppId: { in: opts.githubAppIds },
      repositoryProjectId: null,
      gitBranch: opts.branch,
      deletedAt: null,
      gitRepository: { contains: opts.fullName, mode: 'insensitive' },
    },
    include: { settings: true },
  });

  if (byUrl.length > 0) {
    await prisma.service.updateMany({
      where: { id: { in: byUrl.map((s) => s.id) } },
      data: { repositoryProjectId: opts.repositoryProjectId },
    });
  }

  return byUrl;
}
