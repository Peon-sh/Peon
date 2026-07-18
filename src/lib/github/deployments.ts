import {
  githubInstallationToken,
  resolveGithubAuth,
  type GithubAppForAuth,
} from '@/lib/github/app';
import { asGithubId, githubIdPath } from '@/lib/github/ids';
import type { PreviewCommentPhase } from '@/lib/github/pr-comments';

export const PREVIEW_DEPLOYMENT_ENVIRONMENT = 'Preview';

export type PreviewDeploymentStatusState =
  | 'in_progress'
  | 'success'
  | 'failure'
  | 'inactive'
  | 'error'
  | 'queued'
  | 'pending';

export type PreviewDeploymentCreatePayload = {
  ref: string;
  environment: string;
  description: string;
  auto_merge: false;
  required_contexts: string[];
  transient_environment: true;
  production_environment: false;
};

export type PreviewDeploymentStatusPayload = {
  state: PreviewDeploymentStatusState;
  description: string;
  environment: string;
  log_url?: string;
  environment_url?: string;
  auto_inactive?: boolean;
};

/** Map preview phase → GitHub deployment status body (Vercel-style timeline). */
export function buildPreviewDeploymentStatusPayload(opts: {
  serviceName: string;
  phase: PreviewCommentPhase;
  environmentUrl?: string | null;
  logUrl?: string | null;
  error?: string | null;
}): PreviewDeploymentStatusPayload {
  const logUrl = opts.logUrl?.trim() || undefined;
  const environmentUrl = opts.environmentUrl?.replace(/\/$/, '') || undefined;

  switch (opts.phase) {
    case 'building':
      return {
        state: 'in_progress',
        description: `Building preview for ${opts.serviceName}`,
        environment: PREVIEW_DEPLOYMENT_ENVIRONMENT,
        ...(logUrl ? { log_url: logUrl } : {}),
        ...(environmentUrl ? { environment_url: environmentUrl } : {}),
      };
    case 'ready':
      return {
        state: 'success',
        description: `Preview ready for ${opts.serviceName}`,
        environment: PREVIEW_DEPLOYMENT_ENVIRONMENT,
        auto_inactive: true,
        ...(logUrl ? { log_url: logUrl } : {}),
        ...(environmentUrl ? { environment_url: environmentUrl } : {}),
      };
    case 'failed':
      return {
        state: 'failure',
        description: opts.error?.trim()
          ? opts.error.trim().slice(0, 140)
          : `Preview failed for ${opts.serviceName}`,
        environment: PREVIEW_DEPLOYMENT_ENVIRONMENT,
        ...(logUrl ? { log_url: logUrl } : {}),
      };
    case 'stopped':
      return {
        state: 'inactive',
        description: `Preview stopped for ${opts.serviceName}`,
        environment: PREVIEW_DEPLOYMENT_ENVIRONMENT,
        ...(logUrl ? { log_url: logUrl } : {}),
      };
  }
}

export function buildPreviewDeploymentCreatePayload(opts: {
  headSha: string;
  serviceName: string;
}): PreviewDeploymentCreatePayload {
  return {
    ref: opts.headSha,
    environment: PREVIEW_DEPLOYMENT_ENVIRONMENT,
    description: `Peon preview for ${opts.serviceName}`,
    auto_merge: false,
    required_contexts: [],
    transient_environment: true,
    production_environment: false,
  };
}

async function githubApi<T>(
  app: GithubAppForAuth,
  path: string,
  init: RequestInit,
): Promise<T> {
  const auth = resolveGithubAuth(app);
  const token = await githubInstallationToken(auth);
  const base = auth.apiUrl.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Create or update a GitHub Deployment for a Peon preview.
 * Appears on the PR timeline as "{app} deployed to Preview" (like Vercel).
 * Requires GitHub App permission: Deployments — Read & write.
 */
export async function upsertPreviewDeployment(opts: {
  app: GithubAppForAuth;
  owner: string;
  repo: string;
  /** When set and createNew is false, only post a new status on this deployment. */
  deploymentId?: number | bigint | null;
  /** Force a new Deployment (e.g. new commit) even if deploymentId is set. */
  createNew?: boolean;
  phase: PreviewCommentPhase;
  headSha: string;
  serviceName: string;
  environmentUrl?: string | null;
  logUrl?: string | null;
  error?: string | null;
}): Promise<bigint | null> {
  const pathBase = `/repos/${opts.owner}/${opts.repo}/deployments`;
  const statusPayload = buildPreviewDeploymentStatusPayload({
    serviceName: opts.serviceName,
    phase: opts.phase,
    environmentUrl: opts.environmentUrl,
    logUrl: opts.logUrl,
    error: opts.error,
  });

  try {
    let deploymentId = asGithubId(opts.deploymentId);
    const shouldCreate = deploymentId == null || opts.createNew === true;

    if (shouldCreate) {
      const created = await githubApi<{ id: number | string }>(opts.app, pathBase, {
        method: 'POST',
        body: JSON.stringify(
          buildPreviewDeploymentCreatePayload({
            headSha: opts.headSha,
            serviceName: opts.serviceName,
          }),
        ),
      });
      deploymentId = asGithubId(created.id);
    }

    if (deploymentId == null) return null;

    await githubApi(opts.app, `${pathBase}/${githubIdPath(deploymentId)}/statuses`, {
      method: 'POST',
      body: JSON.stringify(statusPayload),
    });
    return deploymentId;
  } catch (err) {
    console.error('[preview-deployment] failed:', err);
    return asGithubId(opts.deploymentId);
  }
}
