/** Normalize a git repository value to a GitHub repo slug (owner/repo). */
export function githubRepoSlug(gitRepository: string | null | undefined): string | null {
  if (!gitRepository?.trim()) return null;
  const raw = gitRepository.trim().replace(/\.git$/, '');
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const { pathname } = new URL(raw);
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch {
      return null;
    }
    return null;
  }
  return raw.includes('/') ? raw : null;
}

export function githubRepoUrl(gitRepository: string | null | undefined): string | null {
  const slug = githubRepoSlug(gitRepository);
  return slug ? `https://github.com/${slug}` : null;
}

export function githubBranchUrl(
  gitRepository: string | null | undefined,
  branch: string | null | undefined,
): string | null {
  const repo = githubRepoUrl(gitRepository);
  if (!repo || !branch?.trim()) return null;
  return `${repo}/tree/${encodeURIComponent(branch.trim())}`;
}

export function githubCommitUrl(
  gitRepository: string | null | undefined,
  commitSha: string | null | undefined,
): string | null {
  const repo = githubRepoUrl(gitRepository);
  if (!repo || !commitSha?.trim()) return null;
  return `${repo}/commit/${commitSha.trim()}`;
}

/**
 * GitHub UI to manage an App installation.
 * Org installs: /organizations/{org}/settings/installations/{id}
 * User installs: /settings/installations/{id}
 *
 * `organization` stores the account login for both User and Organization installs,
 * so we must use `accountType` — never infer org from a non-empty login.
 */
export function githubInstallationSettingsUrl(opts: {
  installationId: string | null | undefined;
  organization?: string | null;
  /** GitHub account type from the installation API (`Organization` | `User`). */
  accountType?: string | null;
}): string {
  const id = opts.installationId?.trim();
  if (!id) return 'https://github.com/settings/installations';

  const type = opts.accountType?.trim().toLowerCase();
  const org = opts.organization?.trim();

  if (type === 'organization' && org) {
    return `https://github.com/organizations/${encodeURIComponent(org)}/settings/installations/${encodeURIComponent(id)}`;
  }
  return `https://github.com/settings/installations/${encodeURIComponent(id)}`;
}
