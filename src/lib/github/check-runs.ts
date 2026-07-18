import {
  githubInstallationToken,
  resolveGithubAuth,
  type GithubAppForAuth,
} from '@/lib/github/app';
import { asGithubId, githubIdPath } from '@/lib/github/ids';
import type { PreviewCommentPhase } from '@/lib/github/pr-comments';

export type PreviewCheckRunPayload = {
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'neutral' | 'timed_out' | 'action_required' | 'skipped';
  details_url?: string;
  external_id?: string;
  output: {
    title: string;
    summary: string;
    text?: string;
  };
};

export function previewCheckRunName(serviceName: string): string {
  return `Peon Preview — ${serviceName}`;
}

/** Build the GitHub Checks API body for a preview phase (Vercel-style PR check). */
export function buildPreviewCheckRunPayload(opts: {
  serviceId: string;
  serviceName: string;
  phase: PreviewCommentPhase;
  headSha: string;
  fqdn?: string | null;
  detailsUrl?: string | null;
  error?: string | null;
}): PreviewCheckRunPayload {
  const previewUrl = opts.fqdn?.replace(/\/$/, '') || null;
  const details =
    (opts.phase === 'ready' && previewUrl) || opts.detailsUrl?.trim() || previewUrl || undefined;
  const name = previewCheckRunName(opts.serviceName);

  const base = {
    name,
    head_sha: opts.headSha,
    external_id: opts.serviceId,
    ...(details ? { details_url: details } : {}),
  };

  switch (opts.phase) {
    case 'building':
      return {
        ...base,
        status: 'in_progress',
        output: {
          title: 'Building preview',
          summary: `Peon is building a preview for **${opts.serviceName}**.`,
          text: previewUrl ? `Preview URL (pending): ${previewUrl}` : undefined,
        },
      };
    case 'ready':
      return {
        ...base,
        status: 'completed',
        conclusion: 'success',
        details_url: previewUrl || details,
        output: {
          title: 'Preview ready',
          summary: previewUrl
            ? `Preview is ready for **${opts.serviceName}**: ${previewUrl}`
            : `Preview is ready for **${opts.serviceName}**.`,
          text: previewUrl ? `[Open preview](${previewUrl})` : undefined,
        },
      };
    case 'failed':
      return {
        ...base,
        status: 'completed',
        conclusion: 'failure',
        output: {
          title: 'Preview failed',
          summary: `Preview deploy failed for **${opts.serviceName}**.`,
          text: opts.error?.trim()
            ? `\`\`\`\n${opts.error.trim().slice(0, 500)}\n\`\`\``
            : undefined,
        },
      };
    case 'stopped':
      return {
        ...base,
        status: 'completed',
        conclusion: 'cancelled',
        output: {
          title: 'Preview stopped',
          summary: `Preview for **${opts.serviceName}** was stopped (PR closed or torn down).`,
        },
      };
  }
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
 * Create or update a GitHub Check Run for a Peon preview.
 * Appears under PR "Checks" (same place as Vercel / Actions).
 * Requires GitHub App permission: Checks — Read & write.
 */
export async function upsertPreviewCheckRun(opts: {
  app: GithubAppForAuth;
  owner: string;
  repo: string;
  /** When set, PATCH that check run; otherwise POST a new one. */
  checkRunId?: number | bigint | null;
  /** Force a new check run (e.g. new commit) even if checkRunId is set. */
  createNew?: boolean;
  payload: PreviewCheckRunPayload;
}): Promise<bigint | null> {
  const pathBase = `/repos/${opts.owner}/${opts.repo}/check-runs`;
  try {
    const existingId = asGithubId(opts.checkRunId);
    if (existingId != null && !opts.createNew) {
      const updateBody: Record<string, unknown> = {
        status: opts.payload.status,
        output: opts.payload.output,
      };
      if (opts.payload.conclusion) updateBody.conclusion = opts.payload.conclusion;
      if (opts.payload.details_url) updateBody.details_url = opts.payload.details_url;
      await githubApi(opts.app, `${pathBase}/${githubIdPath(existingId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updateBody),
      });
      return existingId;
    }

    const created = await githubApi<{ id: number | string }>(opts.app, pathBase, {
      method: 'POST',
      body: JSON.stringify(opts.payload),
    });
    return asGithubId(created.id);
  } catch (err) {
    console.error('[preview-check-run] failed:', err);
    return asGithubId(opts.checkRunId);
  }
}
