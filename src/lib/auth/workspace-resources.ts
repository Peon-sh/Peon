import { prisma } from '@/lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Bind foreign keys to the workspace that owns the parent resource.
 * REST create/update and MCP service/backup tools all go through these checks.
 */

async function assertWorkspaceMatch(
  row: { workspaceId: string } | null,
  workspaceId: string,
  notFound: string,
  mismatch: string,
): Promise<void> {
  if (!row) throw new NotFoundError(notFound);
  if (row.workspaceId !== workspaceId) throw new ForbiddenError(mismatch);
}

export async function workspaceIdForProject(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) throw new NotFoundError('Project not found.');
  return project.workspaceId;
}

export async function assertProjectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<void> {
  const actual = await workspaceIdForProject(projectId);
  if (actual !== workspaceId) {
    throw new ForbiddenError(
      'This project is in another workspace. Switch workspaces, or pick a project from this one.',
    );
  }
}

export async function workspaceIdForService(serviceId: string): Promise<string> {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { project: { select: { workspaceId: true } } },
  });
  if (!svc) throw new NotFoundError('Service not found.');
  return svc.project.workspaceId;
}

export async function assertServerInWorkspace(serverId: string, workspaceId: string): Promise<void> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { workspaceId: true },
  });
  await assertWorkspaceMatch(
    server,
    workspaceId,
    'Server not found.',
    'This server is in another workspace. Switch workspaces, or pick a server from this one.',
  );
}

export async function assertStorageInWorkspace(
  storageId: string,
  workspaceId: string,
): Promise<void> {
  const storage = await prisma.s3Storage.findUnique({
    where: { id: storageId },
    select: { workspaceId: true },
  });
  await assertWorkspaceMatch(
    storage,
    workspaceId,
    'Storage not found.',
    'This storage is in another workspace. Choose a backup destination from this workspace.',
  );
}

export async function assertPrivateKeyInWorkspace(
  privateKeyId: string,
  workspaceId: string,
): Promise<void> {
  const key = await prisma.privateKey.findUnique({
    where: { id: privateKeyId },
    select: { workspaceId: true },
  });
  await assertWorkspaceMatch(
    key,
    workspaceId,
    'Private key not found.',
    'This SSH key is in another workspace. Pick a key from this workspace.',
  );
}

export async function assertGithubAppInWorkspace(
  githubAppId: string,
  workspaceId: string,
): Promise<void> {
  const app = await prisma.githubApp.findUnique({
    where: { id: githubAppId },
    select: { workspaceId: true },
  });
  await assertWorkspaceMatch(
    app,
    workspaceId,
    'GitHub source not found.',
    'This GitHub source is in another workspace. Pick a source from this workspace.',
  );
}

export async function assertGitlabAppInWorkspace(
  gitlabAppId: string,
  workspaceId: string,
): Promise<void> {
  const app = await prisma.gitlabApp.findUnique({
    where: { id: gitlabAppId },
    select: { workspaceId: true },
  });
  await assertWorkspaceMatch(
    app,
    workspaceId,
    'GitLab source not found.',
    'This GitLab source is in another workspace. Pick a source from this workspace.',
  );
}

export async function assertDestinationInWorkspace(
  destinationId: string,
  workspaceId: string,
  serverId?: string | null,
): Promise<void> {
  const dest = await prisma.dockerDestination.findUnique({
    where: { id: destinationId },
    select: { serverId: true, server: { select: { workspaceId: true } } },
  });
  if (!dest) throw new NotFoundError('Destination not found.');
  if (dest.server.workspaceId !== workspaceId) {
    throw new ForbiddenError(
      'This destination is in another workspace. Pick a destination from this workspace.',
    );
  }
  if (serverId && dest.serverId !== serverId) {
    throw new ValidationError(
      'This destination is not on the server you selected. Choose a destination that belongs to that server.',
    );
  }
}

export type WorkspaceBindings = {
  serverId?: string | null;
  destinationId?: string | null;
  githubAppId?: string | null;
  gitlabAppId?: string | null;
  privateKeyId?: string | null;
};

/** Check every provided foreign key against `workspaceId`. Null/undefined is a no-op. */
export async function assertBindingsInWorkspace(
  workspaceId: string,
  refs: WorkspaceBindings,
  opts?: { existingServerId?: string | null },
): Promise<void> {
  const serverId = refs.serverId !== undefined ? refs.serverId : (opts?.existingServerId ?? null);

  const checks: Promise<void>[] = [];
  if (refs.serverId) checks.push(assertServerInWorkspace(refs.serverId, workspaceId));
  if (refs.privateKeyId) checks.push(assertPrivateKeyInWorkspace(refs.privateKeyId, workspaceId));
  if (refs.githubAppId) checks.push(assertGithubAppInWorkspace(refs.githubAppId, workspaceId));
  if (refs.gitlabAppId) checks.push(assertGitlabAppInWorkspace(refs.gitlabAppId, workspaceId));
  await Promise.all(checks);

  if (refs.destinationId) {
    await assertDestinationInWorkspace(refs.destinationId, workspaceId, serverId);
  }
}
