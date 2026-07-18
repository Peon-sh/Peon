import { createSign } from 'node:crypto';
import { decrypt } from '@/lib/crypto/encryption';
import { AppError } from '@/lib/errors';
import { isE2eMode } from '@/lib/e2e';
import {
  isPlatformGithubConfigured,
  platformGithubPrivateKeyPem,
  serverEnv,
} from '@/lib/env';

export type GithubAppKind = 'CUSTOM' | 'PLATFORM';
export type GithubAppStatus = 'CONNECTED' | 'SUSPENDED' | 'DISCONNECTED';

export interface GithubAppAuthInput {
  appId: string | null;
  installationId: string | null;
  apiUrl: string;
  htmlUrl: string;
  privateKey?: { privateKey: string } | null;
}

/** DB row shape (or subset) passed into auth resolution. */
export type GithubAppForAuth = {
  kind?: GithubAppKind | null;
  status?: GithubAppStatus | null;
  appId: string | null;
  installationId: string | null;
  apiUrl: string;
  htmlUrl: string;
  privateKey?: { privateKey: string } | null;
};

export interface GithubRepository {
  id: number;
  fullName: string;
  name: string;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function decryptMaybe(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function githubJwt(app: GithubAppAuthInput): string {
  if (!app.appId) throw new AppError('GitHub App ID is missing.', 422, 'GITHUB_APP_NOT_CONFIGURED');
  if (!app.privateKey?.privateKey) {
    throw new AppError('GitHub App private key is missing.', 422, 'GITHUB_APP_NOT_CONFIGURED');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    // GitHub recommends backdating slightly for clock skew.
    iat: now - 60,
    exp: now + 9 * 60,
    iss: app.appId,
  };
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();
  const key = decryptMaybe(app.privateKey.privateKey);
  try {
    return `${body}.${signer.sign(key).toString('base64url')}`;
  } catch {
    throw new AppError(
      'GitHub App private key is invalid. Upload the PEM private key downloaded from the GitHub App settings, not the server SSH key.',
      422,
      'GITHUB_APP_INVALID_PRIVATE_KEY',
    );
  }
}

async function githubFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(`GitHub API request failed (${res.status}): ${text || res.statusText}`, res.status, 'GITHUB_API_ERROR');
  }
  return (await res.json()) as T;
}

/** Exchange the app JWT for an installation access token. */
export async function githubInstallationToken(app: GithubAppAuthInput): Promise<string> {
  if (!app.installationId) {
    throw new AppError('GitHub App installation ID is missing.', 422, 'GITHUB_APP_NOT_INSTALLED');
  }
  const jwt = githubJwt(app);
  const url = `${app.apiUrl.replace(/\/$/, '')}/app/installations/${app.installationId}/access_tokens`;
  const data = await githubFetch<{ token: string }>(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return data.token;
}

export async function listGithubInstallationRepos(app: GithubAppAuthInput): Promise<GithubRepository[]> {
  if (isE2eMode()) {
    return [
      {
        id: 1,
        fullName: 'acme/app',
        name: 'app',
        private: false,
        cloneUrl: 'https://github.com/acme/app.git',
        defaultBranch: 'main',
      },
    ];
  }
  const token = await githubInstallationToken(app);
  const base = app.apiUrl.replace(/\/$/, '');
  const repos: GithubRepository[] = [];
  let page = 1;
  while (page <= 10) {
    const data = await githubFetch<{
      repositories: Array<{
        id: number;
        full_name: string;
        name: string;
        private: boolean;
        clone_url: string;
        default_branch: string;
      }>;
    }>(`${base}/installation/repositories?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    repos.push(
      ...data.repositories.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        name: repo.name,
        private: repo.private,
        cloneUrl: repo.clone_url,
        defaultBranch: repo.default_branch,
      })),
    );
    if (data.repositories.length < 100) break;
    page++;
  }
  return repos;
}

export async function listGithubBranches(
  app: GithubAppAuthInput,
  fullName: string,
): Promise<string[]> {
  if (isE2eMode()) return ['main', 'develop'];
  const token = await githubInstallationToken(app);
  const base = app.apiUrl.replace(/\/$/, '');
  const branches = await githubFetch<Array<{ name: string }>>(
    `${base}/repos/${fullName}/branches?per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return branches.map((branch) => branch.name);
}

export async function authenticatedGithubCloneUrl(
  app: GithubAppAuthInput,
  repoUrl: string,
): Promise<string> {
  const token = await githubInstallationToken(app);
  const url = new URL(repoUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

/** Resolve PLATFORM vs CUSTOM apps into a uniform auth input for GitHub API calls. */
export function resolveGithubAuth(app: GithubAppForAuth): GithubAppAuthInput {
  const kind = app.kind ?? 'CUSTOM';
  const status = app.status ?? 'CONNECTED';

  if (kind === 'PLATFORM') {
    if (status === 'DISCONNECTED') {
      throw new AppError('GitHub App is disconnected.', 422, 'GITHUB_APP_DISCONNECTED');
    }
    if (!isPlatformGithubConfigured()) {
      throw new AppError(
        'Platform GitHub App is not configured on this Peon instance.',
        503,
        'GITHUB_PLATFORM_NOT_CONFIGURED',
      );
    }
    const env = serverEnv();
    return {
      appId: env.GITHUB_APP_ID!,
      installationId: app.installationId,
      apiUrl: app.apiUrl,
      htmlUrl: app.htmlUrl,
      privateKey: { privateKey: platformGithubPrivateKeyPem(env) },
    };
  }

  return {
    appId: app.appId,
    installationId: app.installationId,
    apiUrl: app.apiUrl,
    htmlUrl: app.htmlUrl,
    privateKey: app.privateKey,
  };
}

export function platformGithubSourceName(organization: string | null | undefined): string {
  const org = organization?.trim();
  return org ? `GitHub (Peon): ${org}` : 'GitHub (Peon)';
}

/** Fetch the GitHub account (user/org) for an installation — used to label platform sources. */
export async function fetchGithubInstallationAccount(
  app: GithubAppAuthInput,
): Promise<{ login: string; type?: string } | null> {
  if (!app.installationId) return null;
  if (isE2eMode()) return { login: 'acme-org', type: 'Organization' };
  const jwt = githubJwt(app);
  const url = `${app.apiUrl.replace(/\/$/, '')}/app/installations/${app.installationId}`;
  const data = await githubFetch<{ account?: { login?: string; type?: string } }>(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!data.account?.login) return null;
  return { login: data.account.login, type: data.account.type };
}
