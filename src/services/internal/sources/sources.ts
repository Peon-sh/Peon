import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto/encryption';
import { AppError, NotFoundError } from '@/lib/errors';
import {
  isPlatformGithubConfigured,
  publicEnv,
  serverEnv,
} from '@/lib/env';
import {
  fetchGithubInstallationAccount,
  platformGithubSourceName,
  resolveGithubAuth,
} from '@/lib/github/app';
import {
  githubPlatformInstallCallbackUrl,
  githubPlatformInstallUrl,
} from '@/lib/webhooks/github';
import { signGithubConnectState, verifyGithubConnectState } from '@/lib/github/connect-state';
import { assertPrivateKeyInWorkspace } from '@/lib/auth/workspace-resources';
import { AuditService } from '@/services/internal/audit/audit';
import type {
  CreateSourceInput,
  UpdateGithubSourceInput,
  UpdateGitlabSourceInput,
} from '@/schemas/sources.schema';

const githubSelect = {
  id: true,
  uuid: true,
  workspaceId: true,
  name: true,
  organization: true,
  accountType: true,
  apiUrl: true,
  htmlUrl: true,
  customUser: true,
  customPort: true,
  appId: true,
  installationId: true,
  clientId: true,
  privateKeyId: true,
  kind: true,
  status: true,
  isSystemWide: true,
  isPublic: true,
  createdAt: true,
} as const;

const gitlabSelect = {
  id: true,
  uuid: true,
  workspaceId: true,
  name: true,
  organization: true,
  apiUrl: true,
  htmlUrl: true,
  customUser: true,
  customPort: true,
  appId: true,
  oauthId: true,
  groupName: true,
  privateKeyId: true,
  isSystemWide: true,
  isPublic: true,
  createdAt: true,
} as const;

export const SourceService = {
  async list(workspaceId: string) {
    const [github, gitlab] = await Promise.all([
      prisma.githubApp.findMany({
        where: { workspaceId },
        select: githubSelect,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.gitlabApp.findMany({
        where: { workspaceId },
        select: gitlabSelect,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      github,
      gitlab,
      platformGithubConfigured: isPlatformGithubConfigured(),
    };
  },

  async create(workspaceId: string, input: CreateSourceInput) {
    if (input.provider === 'github') {
      const {
        provider: _provider,
        clientSecret,
        webhookSecret,
        isSystemWide: _sw,
        isPublic: _pub,
        ...rest
      } = input;
      void _provider;
      void _sw;
      void _pub;
      if (rest.privateKeyId) {
        await assertPrivateKeyInWorkspace(rest.privateKeyId, workspaceId);
      }
      const created = await prisma.githubApp.create({
        data: {
          ...rest,
          workspaceId,
          kind: 'CUSTOM',
          status: 'CONNECTED',
          isSystemWide: false,
          isPublic: false,
          clientSecret: clientSecret ? encrypt(clientSecret) : null,
          webhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
        },
        select: githubSelect,
      });
      await AuditService.record({
        workspaceId,
        action: 'source.created',
        resourceType: 'source',
        resourceId: created.id,
        resourceName: created.name,
        summary: `Created GitHub source "${created.name}"`,
        metadata: { provider: 'github' },
      });
      return created;
    }
    const {
      provider: _provider,
      appSecret,
      webhookToken,
      isSystemWide: _sw,
      isPublic: _pub,
      ...rest
    } = input;
    void _provider;
    void _sw;
    void _pub;
    if (rest.privateKeyId) {
      await assertPrivateKeyInWorkspace(rest.privateKeyId, workspaceId);
    }
    const created = await prisma.gitlabApp.create({
      data: {
        ...rest,
        workspaceId,
        isSystemWide: false,
        isPublic: false,
        appSecret: appSecret ? encrypt(appSecret) : null,
        webhookToken: webhookToken ? encrypt(webhookToken) : null,
      },
      select: gitlabSelect,
    });
    await AuditService.record({
      workspaceId,
      action: 'source.created',
      resourceType: 'source',
      resourceId: created.id,
      resourceName: created.name,
      summary: `Created GitLab source "${created.name}"`,
      metadata: { provider: 'gitlab' },
    });
    return created;
  },

  /** Resolve a source by id trying github then gitlab. */
  async resolve(sourceId: string) {
    const github = await prisma.githubApp.findUnique({
      where: { id: sourceId },
      select: { id: true, workspaceId: true },
    });
    if (github) return { provider: 'github' as const, workspaceId: github.workspaceId };
    const gitlab = await prisma.gitlabApp.findUnique({
      where: { id: sourceId },
      select: { id: true, workspaceId: true },
    });
    if (gitlab) return { provider: 'gitlab' as const, workspaceId: gitlab.workspaceId };
    throw new NotFoundError('Source not found.');
  },

  async get(sourceId: string) {
    const { provider } = await this.resolve(sourceId);
    if (provider === 'github') {
      let app = await prisma.githubApp.findUnique({ where: { id: sourceId }, select: githubSelect });
      if (!app) throw new NotFoundError('Source not found.');
      app = await ensurePlatformAccountType(app);
      return { provider, ...app };
    }
    const app = await prisma.gitlabApp.findUnique({ where: { id: sourceId }, select: gitlabSelect });
    return { provider, ...app };
  },

  async update(sourceId: string, body: UpdateGithubSourceInput & UpdateGitlabSourceInput) {
    const { provider, workspaceId } = await this.resolve(sourceId);
    if (provider === 'github') {
      const existing = await prisma.githubApp.findUnique({ where: { id: sourceId } });
      if (!existing) throw new NotFoundError('Source not found.');
      if (existing.kind === 'PLATFORM') {
        throw new AppError(
          'Platform GitHub connections cannot be edited as a custom app. Use Reconnect instead.',
          422,
          'GITHUB_PLATFORM_READ_ONLY',
        );
      }
      const {
        clientSecret,
        webhookSecret,
        isSystemWide: _sw,
        isPublic: _pub,
        ...rest
      } = body as UpdateGithubSourceInput;
      void _sw;
      void _pub;
      if (rest.privateKeyId) {
        await assertPrivateKeyInWorkspace(rest.privateKeyId, workspaceId);
      }
      const updated = await prisma.githubApp.update({
        where: { id: sourceId },
        data: {
          ...rest,
          isSystemWide: false,
          isPublic: false,
          ...(clientSecret !== undefined
            ? { clientSecret: clientSecret ? encrypt(clientSecret) : null }
            : {}),
          ...(webhookSecret !== undefined
            ? { webhookSecret: webhookSecret ? encrypt(webhookSecret) : null }
            : {}),
        },
        select: githubSelect,
      });
      await AuditService.record({
        workspaceId: updated.workspaceId,
        action: 'source.updated',
        resourceType: 'source',
        resourceId: updated.id,
        resourceName: updated.name,
        summary: `Updated GitHub source "${updated.name}"`,
        metadata: { provider: 'github' },
      });
      return updated;
    }
    const {
      appSecret,
      webhookToken,
      isSystemWide: _sw,
      isPublic: _pub,
      ...rest
    } = body as UpdateGitlabSourceInput;
    void _sw;
    void _pub;
    if (rest.privateKeyId) {
      await assertPrivateKeyInWorkspace(rest.privateKeyId, workspaceId);
    }
    const updated = await prisma.gitlabApp.update({
      where: { id: sourceId },
      data: {
        ...rest,
        isSystemWide: false,
        isPublic: false,
        ...(appSecret !== undefined ? { appSecret: appSecret ? encrypt(appSecret) : null } : {}),
        ...(webhookToken !== undefined
          ? { webhookToken: webhookToken ? encrypt(webhookToken) : null }
          : {}),
      },
      select: gitlabSelect,
    });
    await AuditService.record({
      workspaceId: updated.workspaceId,
      action: 'source.updated',
      resourceType: 'source',
      resourceId: updated.id,
      resourceName: updated.name,
      summary: `Updated GitLab source "${updated.name}"`,
      metadata: { provider: 'gitlab' },
    });
    return updated;
  },

  async remove(sourceId: string) {
    const { provider, workspaceId } = await this.resolve(sourceId);
    const name =
      provider === 'github'
        ? (await prisma.githubApp.findUnique({ where: { id: sourceId }, select: { name: true } }))?.name
        : (await prisma.gitlabApp.findUnique({ where: { id: sourceId }, select: { name: true } }))?.name;
    if (provider === 'github') {
      await prisma.githubApp.delete({ where: { id: sourceId } });
    } else {
      await prisma.gitlabApp.delete({ where: { id: sourceId } });
    }
    await AuditService.record({
      workspaceId,
      action: 'source.deleted',
      resourceType: 'source',
      resourceId: sourceId,
      resourceName: name ?? null,
      summary: `Deleted ${provider} source`,
      metadata: { provider },
    });
  },

  /** Start platform GitHub App install for a workspace. */
  async startPlatformConnect(workspaceId: string, userId: string): Promise<{ installUrl: string }> {
    if (!isPlatformGithubConfigured()) {
      throw new AppError(
        'Platform GitHub App is not configured on this Peon instance.',
        503,
        'GITHUB_PLATFORM_NOT_CONFIGURED',
      );
    }
    const env = serverEnv();
    const state = signGithubConnectState({ workspaceId, userId });
    return {
      installUrl: githubPlatformInstallUrl(env.GITHUB_APP_SLUG!, state),
    };
  },

  /**
   * Finish platform connect after GitHub redirects to the Setup URL
   * with installation_id + state.
   *
   * Multi-org: each GitHub installation becomes its own PLATFORM row.
   * Reconnecting the same installation updates that row only.
   */
  async completePlatformConnect(opts: {
    state: string | null;
    installationId: string | null;
    setupAction: string | null;
    sessionUserId: string;
  }) {
    const payload = verifyGithubConnectState(opts.state);
    if (payload.userId !== opts.sessionUserId) {
      throw new AppError('GitHub connect state does not match the signed-in user.', 403, 'FORBIDDEN');
    }
    if (!opts.installationId) {
      throw new AppError('Missing installation_id from GitHub.', 400, 'GITHUB_INSTALL_MISSING');
    }
    if (opts.setupAction === 'request') {
      throw new AppError(
        'This GitHub App install requires admin approval. Ask an org owner to approve it, then connect again.',
        400,
        'GITHUB_INSTALL_REQUESTED',
      );
    }
    if (!isPlatformGithubConfigured()) {
      throw new AppError(
        'Platform GitHub App is not configured on this Peon instance.',
        503,
        'GITHUB_PLATFORM_NOT_CONFIGURED',
      );
    }

    const env = serverEnv();
    const installationId = opts.installationId;

    const claimed = await prisma.githubApp.findFirst({
      where: { installationId, workspaceId: payload.workspaceId },
      select: { id: true, workspaceId: true, kind: true, name: true, organization: true },
    });

    let organization: string | null = claimed?.organization ?? null;
    let accountType: string | null = null;
    try {
      const account = await fetchGithubInstallationAccount(
        resolveGithubAuth({
          kind: 'PLATFORM',
          status: 'CONNECTED',
          appId: env.GITHUB_APP_ID!,
          installationId,
          apiUrl: 'https://api.github.com',
          htmlUrl: 'https://github.com',
          privateKey: null,
        }),
      );
      if (account?.login) organization = account.login;
      if (account?.type) accountType = account.type;
    } catch {
      // Best-effort label only.
    }

    const data = {
      name: platformGithubSourceName(organization),
      organization,
      accountType,
      appId: env.GITHUB_APP_ID!,
      installationId,
      status: 'CONNECTED' as const,
      kind: 'PLATFORM' as const,
      apiUrl: 'https://api.github.com',
      // Keep base GitHub URL; install settings path is derived from accountType.
      htmlUrl: 'https://github.com',
      customUser: 'git',
      customPort: 22,
      isSystemWide: false,
      isPublic: false,
      privateKeyId: null,
      clientSecret: null as string | null,
      webhookSecret: null as string | null,
      clientId: env.GITHUB_APP_CLIENT_ID ?? null,
    };

    const app = claimed
      ? await prisma.githubApp.update({
          where: { id: claimed.id },
          data,
          select: githubSelect,
        })
      : await prisma.githubApp.create({
          data: {
            ...data,
            workspaceId: payload.workspaceId,
          },
          select: githubSelect,
        });

    return { app, workspaceId: payload.workspaceId };
  },

  /** Mark platform installations with a lifecycle status (from webhooks). */
  async setInstallationStatus(
    installationId: string,
    status: 'CONNECTED' | 'SUSPENDED' | 'DISCONNECTED',
    organization?: string | null,
    accountType?: string | null,
  ) {
    const org = organization?.trim() || undefined;
    const type = accountType?.trim() || undefined;
    await prisma.githubApp.updateMany({
      where: { installationId },
      data: {
        status,
        ...(org
          ? {
              organization: org,
              name: platformGithubSourceName(org),
            }
          : {}),
        ...(type ? { accountType: type } : {}),
      },
    });
  },

  /** Services linked to this GitHub / GitLab App (Resources tab). */
  async listResources(sourceId: string) {
    const { provider } = await this.resolve(sourceId);
    const services = await prisma.service.findMany({
      where: provider === 'github' ? { githubAppId: sourceId } : { gitlabAppId: sourceId },
      select: {
        id: true,
        name: true,
        kind: true,
        status: true,
        gitRepository: true,
        gitBranch: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return services.map((svc) => ({
      id: svc.id,
      name: svc.name,
      kind: svc.kind,
      status: svc.status,
      gitRepository: svc.gitRepository,
      gitBranch: svc.gitBranch,
      projectId: svc.project.id,
      projectName: svc.project.name,
    }));
  },
};

type GithubSelected = {
  id: string;
  kind: string;
  installationId: string | null;
  organization: string | null;
  accountType: string | null;
  htmlUrl: string;
  [key: string]: unknown;
};

/** Backfill accountType (+ fix htmlUrl) for older PLATFORM rows. */
async function ensurePlatformAccountType<T extends GithubSelected>(app: T): Promise<T> {
  if (app.kind !== 'PLATFORM' || !app.installationId || app.accountType) {
    return app;
  }
  if (!isPlatformGithubConfigured()) return app;

  try {
    const env = serverEnv();
    const account = await fetchGithubInstallationAccount(
      resolveGithubAuth({
        kind: 'PLATFORM',
        status: 'CONNECTED',
        appId: env.GITHUB_APP_ID!,
        installationId: app.installationId,
        apiUrl: 'https://api.github.com',
        htmlUrl: 'https://github.com',
        privateKey: null,
      }),
    );
    if (!account?.type) return app;

    const organization = account.login || app.organization;
    const updated = await prisma.githubApp.update({
      where: { id: app.id },
      data: {
        accountType: account.type,
        organization,
        name: platformGithubSourceName(organization),
        htmlUrl: 'https://github.com',
      },
      select: githubSelect,
    });
    return updated as unknown as T;
  } catch {
    return app;
  }
}

/** Platform callback URL for docs / GitHub App settings. */
export function platformGithubSetupUrl(): string {
  return githubPlatformInstallCallbackUrl(publicEnv.appUrl);
}