import { prisma } from '@/lib/prisma';
import { buildPreviewFqdn } from '@/lib/deploy/preview-fqdn';
import {
  buildPreviewCommentBody,
  upsertPreviewPullRequestComment,
  type PreviewCommentPhase,
} from '@/lib/github/pr-comments';
import {
  buildPreviewCheckRunPayload,
  upsertPreviewCheckRun,
} from '@/lib/github/check-runs';
import { upsertPreviewDeployment } from '@/lib/github/deployments';
import { githubIdsEqual } from '@/lib/github/ids';
import { isSafeGitRefName } from '@/lib/git/ref';
import type { GithubPullRequestInfo } from '@/lib/webhooks/github';
import { ForbiddenError } from '@/lib/errors';
import {
  assertServerCanAcceptQueuedDeployment,
  scheduleQueuedDeployment,
  ServerDeployQueueFullError,
} from '@/services/internal/deploy/server-queue';
import { BillingService } from '@/services/internal/billing/billing';
import { executorForServer } from '@/lib/executor';
import type { GithubAppForAuth } from '@/lib/github/app';

const BASE_DIR = '/data/peon/services';

function previewDir(serviceUuid: string, pullRequestId: number): string {
  return `${BASE_DIR}/${serviceUuid}/pr-${pullRequestId}`;
}

function peonAppBaseUrl(): string | null {
  const raw = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

function peonDeploymentDetailsUrl(opts: {
  projectId: string;
  serviceId: string;
  deploymentId?: string | null;
}): string | null {
  const base = peonAppBaseUrl();
  if (!base) return null;
  if (opts.deploymentId) {
    return `${base}/projects/${opts.projectId}/services/${opts.serviceId}/deployments/${opts.deploymentId}`;
  }
  return `${base}/projects/${opts.projectId}/services/${opts.serviceId}`;
}

/** Sticky PR comment + Check Run + Deployment (Vercel-style Checks + timeline). */
async function syncPreviewGithubStatus(opts: {
  app: GithubAppForAuth;
  owner: string;
  repo: string;
  pullRequestId: number;
  serviceId: string;
  serviceName: string;
  phase: PreviewCommentPhase;
  fqdn?: string | null;
  commitSha?: string | null;
  error?: string | null;
  detailsUrl?: string | null;
  commentId?: number | bigint | null;
  checkRunId?: number | bigint | null;
  githubDeploymentId?: number | bigint | null;
  /** New commit / new build — always create a fresh check run + deployment. */
  createNewCheckRun?: boolean;
}): Promise<{
  commentId: bigint | null;
  checkRunId: bigint | null;
  githubDeploymentId: bigint | null;
}> {
  const body = buildPreviewCommentBody({
    serviceId: opts.serviceId,
    serviceName: opts.serviceName,
    phase: opts.phase,
    fqdn: opts.fqdn,
    commitSha: opts.commitSha,
    error: opts.error,
    updatedAt: new Date(),
    detailsUrl: opts.detailsUrl,
  });
  const commentId = await upsertPreviewPullRequestComment({
    app: opts.app,
    owner: opts.owner,
    repo: opts.repo,
    pullRequestId: opts.pullRequestId,
    serviceId: opts.serviceId,
    commentId: opts.commentId,
    body,
  });

  let checkRunId: bigint | null = null;
  let githubDeploymentId: bigint | null = null;
  const headSha = opts.commitSha?.trim();
  const createNew = opts.createNewCheckRun === true || opts.phase === 'building';
  if (headSha) {
    const payload = buildPreviewCheckRunPayload({
      serviceId: opts.serviceId,
      serviceName: opts.serviceName,
      phase: opts.phase,
      headSha,
      fqdn: opts.fqdn,
      detailsUrl: opts.detailsUrl,
      error: opts.error,
    });
    checkRunId = await upsertPreviewCheckRun({
      app: opts.app,
      owner: opts.owner,
      repo: opts.repo,
      checkRunId: opts.checkRunId,
      createNew,
      payload,
    });
    githubDeploymentId = await upsertPreviewDeployment({
      app: opts.app,
      owner: opts.owner,
      repo: opts.repo,
      deploymentId: opts.githubDeploymentId,
      createNew,
      phase: opts.phase,
      headSha,
      serviceName: opts.serviceName,
      environmentUrl: opts.fqdn,
      logUrl: opts.detailsUrl,
      error: opts.error,
    });
  }

  return { commentId, checkRunId, githubDeploymentId };
}

function githubIdPatch(opts: {
  commentId: bigint | null;
  checkRunId: bigint | null;
  githubDeploymentId: bigint | null;
  prevCommentId: bigint | number | null | undefined;
  prevCheckRunId: bigint | number | null | undefined;
  prevDeploymentId: bigint | number | null | undefined;
}): {
  githubCommentId?: bigint;
  githubCheckRunId?: bigint;
  githubDeploymentId?: bigint;
} {
  const patch: {
    githubCommentId?: bigint;
    githubCheckRunId?: bigint;
    githubDeploymentId?: bigint;
  } = {};
  if (opts.commentId != null && !githubIdsEqual(opts.commentId, opts.prevCommentId)) {
    patch.githubCommentId = opts.commentId;
  }
  if (opts.checkRunId != null && !githubIdsEqual(opts.checkRunId, opts.prevCheckRunId)) {
    patch.githubCheckRunId = opts.checkRunId;
  }
  if (
    opts.githubDeploymentId != null &&
    !githubIdsEqual(opts.githubDeploymentId, opts.prevDeploymentId)
  ) {
    patch.githubDeploymentId = opts.githubDeploymentId;
  }
  return patch;
}

export async function findServicesForPullRequest(opts: {
  githubAppIds: string[];
  repositoryProjectId: number;
  fullName: string;
  baseBranch: string;
}) {
  const byId = await prisma.service.findMany({
    where: {
      githubAppId: { in: opts.githubAppIds },
      repositoryProjectId: opts.repositoryProjectId,
      gitBranch: opts.baseBranch,
      deletedAt: null,
      settings: { isPreviewDeploymentsEnabled: true },
    },
    include: {
      settings: true,
      server: { include: { settings: true } },
      githubApp: { include: { privateKey: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (byId.length > 0) return byId;

  return prisma.service.findMany({
    where: {
      githubAppId: { in: opts.githubAppIds },
      repositoryProjectId: null,
      gitBranch: opts.baseBranch,
      deletedAt: null,
      gitRepository: { contains: opts.fullName, mode: 'insensitive' },
      settings: { isPreviewDeploymentsEnabled: true },
    },
    include: {
      settings: true,
      server: { include: { settings: true } },
      githubApp: { include: { privateKey: true } },
      project: { select: { id: true, name: true } },
    },
  });
}

/**
 * Queue a PR preview deploy (or tear down on close).
 * FQDN = `{shortSha}.{server.wildcardDomain}` e.g. `abc1234.preview.peon.sh`.
 */
export async function handlePreviewPullRequest(opts: {
  pr: GithubPullRequestInfo;
  services: Awaited<ReturnType<typeof findServicesForPullRequest>>;
}): Promise<{
  deployments: Array<{ serviceId: string; serviceName: string; deploymentId: string }>;
  skipped: Array<{ serviceId: string; serviceName: string; reason: string }>;
}> {
  const { pr, services } = opts;
  const deployments: Array<{ serviceId: string; serviceName: string; deploymentId: string }> = [];
  const skipped: Array<{ serviceId: string; serviceName: string; reason: string }> = [];

  if (!pr.pullRequestId || !pr.baseBranch) {
    return { deployments, skipped };
  }

  const closeActions = new Set(['closed', 'converted_to_draft']);
  const deployActions = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review']);

  for (const svc of services) {
    if (closeActions.has(pr.action ?? '')) {
      await teardownPreview(svc, pr.pullRequestId, pr);
      continue;
    }
    if (!deployActions.has(pr.action ?? '')) {
      skipped.push({
        serviceId: svc.id,
        serviceName: svc.name,
        reason: `pull_request action ${pr.action ?? 'unknown'} ignored`,
      });
      continue;
    }
    if (!pr.commitSha || !pr.headBranch) {
      skipped.push({
        serviceId: svc.id,
        serviceName: svc.name,
        reason: 'missing PR head branch or commit',
      });
      continue;
    }
    // The head branch is chosen by whoever opened the PR — on a public repo that
    // is anyone. Refuse anything outside a plain refname before it is persisted
    // or handed to the deploy engine.
    if (!isSafeGitRefName(pr.headBranch)) {
      skipped.push({
        serviceId: svc.id,
        serviceName: svc.name,
        reason: 'PR head branch name contains forbidden characters',
      });
      continue;
    }
    if (pr.draft) {
      skipped.push({ serviceId: svc.id, serviceName: svc.name, reason: 'draft PR' });
      continue;
    }

    const project = await prisma.project.findUnique({
      where: { id: svc.projectId },
      select: { workspaceId: true },
    });
    if (!project) {
      skipped.push({ serviceId: svc.id, serviceName: svc.name, reason: 'project not found' });
      continue;
    }
    try {
      await BillingService.assertProjectWritable(project.workspaceId);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        skipped.push({ serviceId: svc.id, serviceName: svc.name, reason: err.message });
        continue;
      }
      throw err;
    }

    const wildcard = svc.server?.settings?.wildcardDomain;
    if (!wildcard) {
      skipped.push({
        serviceId: svc.id,
        serviceName: svc.name,
        reason: 'server has no wildcard domain configured',
      });
      continue;
    }

    const fqdn = buildPreviewFqdn(pr.commitSha, wildcard);
    if (!fqdn) {
      skipped.push({
        serviceId: svc.id,
        serviceName: svc.name,
        reason: 'could not build preview FQDN from wildcard domain',
      });
      continue;
    }

    try {
      if (svc.serverId) {
        await assertServerCanAcceptQueuedDeployment(svc.serverId);
      }
    } catch (err) {
      if (err instanceof ServerDeployQueueFullError) {
        skipped.push({ serviceId: svc.id, serviceName: svc.name, reason: err.message });
        continue;
      }
      throw err;
    }

    const preview = await prisma.servicePreview.upsert({
      where: {
        serviceId_pullRequestId: {
          serviceId: svc.id,
          pullRequestId: pr.pullRequestId,
        },
      },
      create: {
        serviceId: svc.id,
        pullRequestId: pr.pullRequestId,
        fqdn,
        headBranch: pr.headBranch,
        commitSha: pr.commitSha,
        status: 'STARTING',
      },
      update: {
        fqdn,
        headBranch: pr.headBranch,
        commitSha: pr.commitSha,
        status: 'STARTING',
      },
    });

    const deployment = await prisma.deployment.create({
      data: {
        serviceId: svc.id,
        status: 'QUEUED',
        triggeredBy: 'webhook',
        isPreview: true,
        pullRequestId: pr.pullRequestId,
        commitSha: pr.commitSha,
        commitMessage: pr.commitMessage ?? null,
      },
    });

    await scheduleQueuedDeployment({
      deploymentId: deployment.id,
      serviceId: svc.id,
      serverId: svc.serverId,
      kind: svc.kind,
    });

    if (svc.githubApp && pr.owner && pr.repo) {
      const { commentId, checkRunId, githubDeploymentId } = await syncPreviewGithubStatus({
        app: svc.githubApp,
        owner: pr.owner,
        repo: pr.repo,
        pullRequestId: pr.pullRequestId,
        serviceId: svc.id,
        serviceName: svc.name,
        phase: 'building',
        fqdn,
        commitSha: pr.commitSha,
        detailsUrl: peonDeploymentDetailsUrl({
          projectId: svc.projectId,
          serviceId: svc.id,
          deploymentId: deployment.id,
        }),
        commentId: preview.githubCommentId,
        checkRunId: preview.githubCheckRunId,
        githubDeploymentId: preview.githubDeploymentId,
        createNewCheckRun: true,
      });
      const patch = githubIdPatch({
        commentId,
        checkRunId,
        githubDeploymentId,
        prevCommentId: preview.githubCommentId,
        prevCheckRunId: preview.githubCheckRunId,
        prevDeploymentId: preview.githubDeploymentId,
      });
      if (Object.keys(patch).length > 0) {
        await prisma.servicePreview.update({
          where: { id: preview.id },
          data: patch,
        });
      }
    }

    deployments.push({
      serviceId: svc.id,
      serviceName: svc.name,
      deploymentId: deployment.id,
    });
  }

  return { deployments, skipped };
}

async function teardownPreview(
  svc: Awaited<ReturnType<typeof findServicesForPullRequest>>[number],
  pullRequestId: number,
  pr: GithubPullRequestInfo,
): Promise<void> {
  const preview = await prisma.servicePreview.findUnique({
    where: {
      serviceId_pullRequestId: { serviceId: svc.id, pullRequestId },
    },
  });
  if (!preview) return;

  if (svc.serverId) {
    try {
      const executor = await executorForServer(svc.serverId);
      const dir = previewDir(svc.uuid, pullRequestId);
      await executor.exec(
        `if [ -f ${dir}/docker-compose.yml ]; then cd ${dir} && docker compose down --remove-orphans || true; fi`,
      );
    } catch (err) {
      console.error(`[preview] teardown failed for ${svc.id} PR #${pullRequestId}:`, err);
    }
  }

  if (svc.githubApp && pr.owner && pr.repo) {
    await syncPreviewGithubStatus({
      app: svc.githubApp,
      owner: pr.owner,
      repo: pr.repo,
      pullRequestId,
      serviceId: svc.id,
      serviceName: svc.name,
      phase: 'stopped',
      fqdn: preview.fqdn,
      commitSha: preview.commitSha,
      detailsUrl: peonDeploymentDetailsUrl({
        projectId: svc.projectId,
        serviceId: svc.id,
      }),
      commentId: preview.githubCommentId,
      checkRunId: preview.githubCheckRunId,
      githubDeploymentId: preview.githubDeploymentId,
    });
  }

  await prisma.servicePreview.delete({ where: { id: preview.id } });
}

/** Update sticky PR comment / check after a preview deploy finishes or fails. */
export async function notifyPreviewDeployOutcome(opts: {
  serviceId: string;
  pullRequestId: number;
  phase: 'ready' | 'failed';
  fqdn?: string | null;
  commitSha?: string | null;
  error?: string | null;
}): Promise<void> {
  const svc = await prisma.service.findUnique({
    where: { id: opts.serviceId },
    include: { githubApp: { include: { privateKey: true } } },
  });
  const preview = await prisma.servicePreview.findUnique({
    where: {
      serviceId_pullRequestId: {
        serviceId: opts.serviceId,
        pullRequestId: opts.pullRequestId,
      },
    },
  });
  if (!preview) return;

  // Persist preview runtime state first so a GitHub API / ID write failure
  // cannot leave the row stuck in STARTING after a successful deploy.
  await prisma.servicePreview.update({
    where: { id: preview.id },
    data: {
      status: opts.phase === 'ready' ? 'RUNNING' : 'DEGRADED',
      ...(opts.fqdn ? { fqdn: opts.fqdn } : {}),
    },
  });

  if (!svc?.githubApp || !svc.gitRepository) return;

  const fullName = svc.gitRepository
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/\.git$/, '');
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) return;

  try {
    const { commentId, checkRunId, githubDeploymentId } = await syncPreviewGithubStatus({
      app: svc.githubApp,
      owner,
      repo,
      pullRequestId: opts.pullRequestId,
      serviceId: svc.id,
      serviceName: svc.name,
      phase: opts.phase,
      fqdn: opts.fqdn ?? preview.fqdn,
      commitSha: opts.commitSha ?? preview.commitSha,
      error: opts.error,
      detailsUrl: peonDeploymentDetailsUrl({
        projectId: svc.projectId,
        serviceId: svc.id,
      }),
      commentId: preview.githubCommentId,
      checkRunId: preview.githubCheckRunId,
      githubDeploymentId: preview.githubDeploymentId,
    });
    const patch = githubIdPatch({
      commentId,
      checkRunId,
      githubDeploymentId,
      prevCommentId: preview.githubCommentId,
      prevCheckRunId: preview.githubCheckRunId,
      prevDeploymentId: preview.githubDeploymentId,
    });
    if (Object.keys(patch).length > 0) {
      await prisma.servicePreview.update({
        where: { id: preview.id },
        data: patch,
      });
    }
  } catch (err) {
    console.error('[preview] notify GitHub status failed:', err);
  }
}

export { previewDir };
