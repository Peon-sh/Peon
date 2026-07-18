import { createHmac, timingSafeEqual } from 'node:crypto';

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Verify GitHub's X-Hub-Signature-256 against a shared secret. */
export function verifyGithubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(signatureHeader, expected);
}

export interface GithubPushInfo {
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  repositoryId?: number;
  fullName?: string;
  changedFiles: string[];
  commitMessages: string[];
}

export interface GithubPullRequestInfo {
  action?: string;
  pullRequestId?: number;
  /** Base branch the PR targets (e.g. main). */
  baseBranch?: string;
  /** Head branch / commit. */
  headBranch?: string;
  commitSha?: string;
  commitMessage?: string;
  repositoryId?: number;
  fullName?: string;
  /** owner/repo suitable for Issues API paths. */
  owner?: string;
  repo?: string;
  draft?: boolean;
}

/** Parse a GitHub pull_request webhook payload. */
export function parseGithubPullRequestPayload(body: unknown): GithubPullRequestInfo {
  const p = (body ?? {}) as Record<string, unknown>;
  const action = typeof p.action === 'string' ? p.action : undefined;

  const repository = (p.repository ?? null) as Record<string, unknown> | null;
  const repositoryId = typeof repository?.id === 'number' ? repository.id : undefined;
  const fullName = typeof repository?.full_name === 'string' ? repository.full_name : undefined;
  const [owner, repo] = fullName?.split('/') ?? [];

  const pr = (p.pull_request ?? null) as Record<string, unknown> | null;
  const base = (pr?.base ?? null) as Record<string, unknown> | null;
  const head = (pr?.head ?? null) as Record<string, unknown> | null;

  return {
    action,
    pullRequestId: typeof pr?.number === 'number' ? pr.number : undefined,
    baseBranch: typeof base?.ref === 'string' ? base.ref : undefined,
    headBranch: typeof head?.ref === 'string' ? head.ref : undefined,
    commitSha: typeof head?.sha === 'string' ? head.sha : undefined,
    commitMessage: typeof pr?.title === 'string' ? pr.title : undefined,
    repositoryId,
    fullName,
    owner: owner || undefined,
    repo: repo || undefined,
    draft: pr?.draft === true,
  };
}

/** Parse a GitHub push (or ping) JSON payload. */
export function parseGithubPushPayload(body: unknown): GithubPushInfo {
  const p = (body ?? {}) as Record<string, unknown>;
  const ref = typeof p.ref === 'string' ? p.ref : undefined;
  const branch = ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined;

  const repository = (p.repository ?? null) as Record<string, unknown> | null;
  const repositoryId = typeof repository?.id === 'number' ? repository.id : undefined;
  const fullName = typeof repository?.full_name === 'string' ? repository.full_name : undefined;

  const commits = Array.isArray(p.commits) ? (p.commits as Record<string, unknown>[]) : [];
  const commitMessages = commits
    .map((c) => (typeof c.message === 'string' ? c.message : ''))
    .filter(Boolean);
  const changedFiles = [
    ...commits.flatMap((c) => (Array.isArray(c.added) ? (c.added as string[]) : [])),
    ...commits.flatMap((c) => (Array.isArray(c.removed) ? (c.removed as string[]) : [])),
    ...commits.flatMap((c) => (Array.isArray(c.modified) ? (c.modified as string[]) : [])),
  ];

  const headCommit = (p.head_commit ?? null) as Record<string, unknown> | null;
  return {
    branch,
    commitSha: typeof p.after === 'string' ? p.after : undefined,
    commitMessage:
      headCommit && typeof headCommit.message === 'string'
        ? headCommit.message
        : commitMessages[commitMessages.length - 1],
    repositoryId,
    fullName,
    changedFiles: [...new Set(changedFiles)],
    commitMessages,
  };
}

/** Skip when every commit message contains [skip ci] or [skip cd]. */
export function shouldSkipDeploy(commitMessages: string[]): boolean {
  if (commitMessages.length === 0) return false;
  return commitMessages.every((m) => /\[skip\s*(?:ci|cd)\]/i.test(m));
}

/**
 * If watchPaths is blank, always deploy. Otherwise deploy when any changed
 * file matches a watch path line (substring or simple * suffix/prefix).
 */
export function isWatchPathsTriggered(watchPaths: string | null | undefined, changedFiles: string[]): boolean {
  if (!watchPaths?.trim()) return true;
  if (changedFiles.length === 0) return true;
  const patterns = watchPaths
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (patterns.length === 0) return true;

  return changedFiles.some((file) =>
    patterns.some((pattern) => {
      if (pattern.includes('*')) {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        return new RegExp(`^${escaped}$`).test(file);
      }
      return file.includes(pattern) || file.startsWith(pattern.replace(/^\//, ''));
    }),
  );
}

/** Absolute URL GitHub should call for App-level push events. */
export function githubAppEventsWebhookUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/webhooks/source/github/events`;
}

/**
 * Suggested GitHub App "Setup URL" (post-install redirect).
 * Lands on the Peon source page — installation ID is still entered manually
 * until a /webhooks/source/github/install callback exists.
 */
export function githubAppSetupUrl(appUrl: string, sourceId: string): string {
  return `${appUrl.replace(/\/$/, '')}/sources/${sourceId}`;
}

/** OAuth/install callback for the platform Peon GitHub App. */
export function githubPlatformInstallCallbackUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/api/sources/github/install/callback`;
}

/** Start a new platform GitHub App installation (signed state in query). */
export function githubPlatformInstallUrl(appSlug: string, state: string): string {
  return `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}
