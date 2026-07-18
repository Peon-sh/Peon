import { prisma } from '@/lib/prisma';
import type { ProjectRole, User, Workspace, WorkspaceRole } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { encrypt } from '@/lib/crypto/encryption';
import { clearCookies, http } from './http';

export const DEFAULT_PASSWORD = 'Test1234!';

export async function createUser(opts?: {
  email?: string;
  password?: string;
  name?: string;
  isOnboarded?: boolean;
  isInstanceAdmin?: boolean;
}): Promise<User & { password: string }> {
  const email = opts?.email ?? `user-${crypto.randomUUID()}@peon.test`;
  const password = opts?.password ?? DEFAULT_PASSWORD;
  const user = await prisma.user.create({
    data: {
      email,
      name: opts?.name ?? 'Test User',
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      isOnboarded: opts?.isOnboarded ?? true,
      isInstanceAdmin: opts?.isInstanceAdmin ?? false,
    },
  });
  return Object.assign(user, { password });
}

/** Log in through the real HTTP API and store the session cookie. */
export async function loginAs(
  user: { email: string; password?: string },
  password = DEFAULT_PASSWORD,
): Promise<void> {
  clearCookies();
  const res = await http.post('/api/auth/login', {
    body: { email: user.email, password: user.password ?? password },
  });
  if (res.status !== 200) {
    throw new Error(`loginAs failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

export async function createWorkspaceFor(
  owner: User,
  opts?: { name?: string; role?: WorkspaceRole; personal?: boolean },
): Promise<Workspace> {
  const role = opts?.role ?? 'OWNER';
  const slug = `ws-${crypto.randomUUID().slice(0, 8)}`;
  return prisma.workspace.create({
    data: {
      name: opts?.name ?? 'Test Workspace',
      slug,
      personal: opts?.personal ?? false,
      ownerId: owner.id,
      memberships: { create: { userId: owner.id, role } },
    },
  });
}

export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = 'MEMBER',
) {
  return prisma.workspaceMembership.create({
    data: { workspaceId, userId, role },
  });
}

export async function createProjectFor(
  workspaceId: string,
  opts?: { name?: string; memberUserId?: string; memberRole?: ProjectRole },
) {
  const project = await prisma.project.create({
    data: {
      workspaceId,
      name: opts?.name ?? 'Test Project',
      settings: { create: {} },
    },
  });
  if (opts?.memberUserId) {
    await prisma.projectMembership.create({
      data: {
        projectId: project.id,
        userId: opts.memberUserId,
        role: opts.memberRole ?? 'MEMBER',
      },
    });
  }
  return project;
}

export async function createPrivateKeyFor(workspaceId: string, name = 'deploy-key') {
  return prisma.privateKey.create({
    data: {
      workspaceId,
      name,
      privateKey: encrypt(
        '-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n',
      ),
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFake test@peon',
      fingerprint: 'SHA256:fake',
    },
  });
}

export async function createServerFor(
  workspaceId: string,
  privateKeyId: string,
  opts?: { name?: string; ip?: string },
) {
  return prisma.server.create({
    data: {
      workspaceId,
      name: opts?.name ?? 'vps-1',
      ip: opts?.ip ?? '10.0.0.1',
      port: 22,
      user: 'root',
      privateKeyId,
      settings: {
        create: {
          forceDockerCleanup: true,
          deleteUnusedVolumes: true,
          deleteUnusedNetworks: true,
        },
      },
      destinations: { create: { name: 'default', network: 'peon' } },
    },
    include: { destinations: true, settings: true },
  });
}

export async function createServiceFor(
  projectId: string,
  opts?: {
    name?: string;
    serverId?: string;
    destinationId?: string;
    kind?: 'GIT_APP' | 'DATABASE' | 'DOCKER_IMAGE' | 'COMPOSE' | 'NIXPACKS';
  },
) {
  const kind = opts?.kind ?? 'GIT_APP';
  return prisma.service.create({
    data: {
      projectId,
      name: opts?.name ?? 'web',
      kind,
      serverId: opts?.serverId,
      destinationId: opts?.destinationId,
      buildPack: kind === 'DATABASE' ? null : 'NIXPACKS',
      gitRepository: kind === 'DATABASE' ? null : 'https://github.com/acme/app.git',
      gitBranch: kind === 'DATABASE' ? null : 'main',
      databaseEngine: kind === 'DATABASE' ? 'POSTGRESQL' : null,
      databaseImage: kind === 'DATABASE' ? 'postgres:16' : null,
      settings: { create: {} },
    },
    include: { settings: true },
  });
}

export async function plantOtp(email: string, purpose: 'SIGNUP' | 'RESET_PASSWORD', code = '123456') {
  await prisma.emailOtp.deleteMany({ where: { email, purpose } });
  return prisma.emailOtp.create({
    data: {
      email,
      purpose,
      codeHash: await hashPassword(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

export async function ensureInstanceSettings() {
  return prisma.instanceSettings.upsert({
    where: { id: 'instance' },
    create: {
      id: 'instance',
      fqdn: 'http://127.0.0.1:3100',
      isRegistrationEnabled: true,
    },
    update: {},
  });
}
