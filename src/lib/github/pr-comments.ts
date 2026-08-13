import {
  githubInstallationToken,
  resolveGithubAuth,
  type GithubAppForAuth,
} from '@/lib/github/app';
import { asGithubId, githubIdPath } from '@/lib/github/ids';
import { assertSafeEgressUrl } from '@/lib/net/egress';

const MARKER_PREFIX = '<!-- peon-preview:';

export type PreviewCommentPhase = 'building' | 'ready' | 'failed' | 'stopped';

export function previewCommentMarker(serviceId: string): string {
  return `${MARKER_PREFIX}${serviceId} -->`;
}

function formatUpdatedUtc(date: Date = new Date()): string {
  // e.g. Jul 17, 2026 2:39pm
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const month = get('month');
  const day = get('day');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const dayPeriod = get('dayPeriod').toLowerCase();
  return `${month} ${day}, ${year} ${hour}:${minute}${dayPeriod}`;
}

function deploymentCell(opts: {
  phase: PreviewCommentPhase;
  fqdn?: string | null;
  detailsUrl?: string | null;
}): string {
  const url = opts.detailsUrl?.trim() || opts.fqdn?.replace(/\/$/, '') || null;
  switch (opts.phase) {
    case 'building':
      return url ? `🟡 [Building](${url})` : '🟡 Building';
    case 'ready':
      return url ? `🟢 [Ready](${url})` : '🟢 Ready';
    case 'failed':
      return url ? `🔴 [Failed](${url})` : '🔴 Failed';
    case 'stopped':
      return url ? `⚪ [Stopped](${url})` : '⚪ Stopped';
  }
}

function actionsCell(opts: {
  phase: PreviewCommentPhase;
  fqdn?: string | null;
}): string {
  const previewUrl = opts.fqdn?.replace(/\/$/, '') || null;
  if (opts.phase === 'ready' && previewUrl) {
    return `[Preview](${previewUrl})`;
  }
  if (opts.phase === 'building' && previewUrl) {
    return `_Pending_`;
  }
  return '—';
}

/**
 * Sticky PR comment body — Vercel-style summary table.
 * One row per Peon service (marker keeps comments sticky per service).
 */
export function buildPreviewCommentBody(opts: {
  serviceId: string;
  serviceName: string;
  phase: PreviewCommentPhase;
  fqdn?: string | null;
  commitSha?: string | null;
  error?: string | null;
  updatedAt?: Date;
  /** Peon deployment / service URL for the Deployment column link. */
  detailsUrl?: string | null;
}): string {
  const marker = previewCommentMarker(opts.serviceId);
  const sha = opts.commitSha ? opts.commitSha.slice(0, 7) : null;
  const updated = formatUpdatedUtc(opts.updatedAt ?? new Date());
  const projectLabel = sha
    ? `**${opts.serviceName}** (\`${sha}\`)`
    : `**${opts.serviceName}**`;

  const rows = [
    '| Project | Deployment | Actions | Updated (UTC) |',
    '| :--- | :--- | :--- | :--- |',
    `| ${projectLabel} | ${deploymentCell(opts)} | ${actionsCell(opts)} | ${updated} |`,
  ];

  let body = `${marker}
The latest updates on your projects. Learn more about [Peon](https://peon.sh).

${rows.join('\n')}`;

  if (opts.phase === 'failed' && opts.error?.trim()) {
    body += `\n\n<details><summary>Error</summary>\n\n\`\`\`\n${opts.error.trim().slice(0, 500)}\n\`\`\`\n\n</details>`;
  }

  return body;
}

async function githubApi<T>(
  app: GithubAppForAuth,
  path: string,
  init: RequestInit,
): Promise<T> {
  const auth = resolveGithubAuth(app);
  const token = await githubInstallationToken(auth);
  const base = auth.apiUrl.replace(/\/$/, '');
  const url = `${base}${path}`;
  await assertSafeEgressUrl(url, { label: 'GitHub API URL' });
  const res = await fetch(url, {
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

/** Create or update a sticky PR comment for a Peon preview deployment. */
export async function upsertPreviewPullRequestComment(opts: {
  app: GithubAppForAuth;
  owner: string;
  repo: string;
  pullRequestId: number;
  serviceId: string;
  commentId?: number | bigint | null;
  body: string;
}): Promise<bigint | null> {
  try {
    const existingId = asGithubId(opts.commentId);
    if (existingId != null) {
      await githubApi(opts.app, `/repos/${opts.owner}/${opts.repo}/issues/comments/${githubIdPath(existingId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: opts.body }),
      });
      return existingId;
    }

    const created = await githubApi<{ id: number | string }>(
      opts.app,
      `/repos/${opts.owner}/${opts.repo}/issues/${opts.pullRequestId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body: opts.body }),
      },
    );
    return asGithubId(created.id);
  } catch (err) {
    console.error('[preview-comment] failed:', err);
    return asGithubId(opts.commentId);
  }
}
