import { prisma } from '@/lib/prisma';
import type { Server } from '@/lib/prisma';
import { DEFAULT_NETWORK } from '@/lib/docker/naming';

/**
 * The Peon host as a deployment target.
 *
 * Single-server installations must be able to deploy onto the machine Peon runs
 * on without the user creating SSH keys, installing sshd, pointing Peon at
 * 127.0.0.1, or hand-crafting a Server row that pretends to be remote. This
 * module owns that concept.
 *
 * A local server is an ordinary `Server` row with `executionMode: LOCAL`. It
 * keeps every existing relationship — workspace scoping, RBAC, destinations,
 * settings, tags, services — so nothing downstream needs to special-case it.
 * The only difference is that `executorForServer()` hands back a
 * `LocalServerExecutor` instead of an SSH one.
 *
 * Hybrid is therefore free: a workspace may hold one local server and any number
 * of remote ones simultaneously, and each service picks its target as always.
 * Local and remote are not installation modes; they are a per-server property.
 */

/** Placeholder host value. Never dialled — local execution opens no socket. */
const LOCAL_HOST = 'local';

export const DEFAULT_LOCAL_SERVER_NAME = 'This server';

export interface EnsureLocalServerInput {
  workspaceId: string;
  name?: string;
  /** Wildcard domain for services deployed here, e.g. `*.apps.example.com`. */
  wildcardDomain?: string | null;
}

/** The workspace's local server, if it has one. */
export async function findLocalServer(workspaceId: string): Promise<Server | null> {
  return prisma.server.findFirst({
    where: { workspaceId, executionMode: 'LOCAL' },
  });
}

/**
 * Create the local server for a workspace, or return the existing one.
 *
 * Idempotent so the installer and the onboarding flow can both call it without
 * coordinating. Deliberately does not validate Docker — registration should
 * succeed even when the daemon is temporarily unreachable, and
 * `ServerOperations.validate` reports that separately.
 */
export async function ensureLocalServer(input: EnsureLocalServerInput): Promise<Server> {
  const existing = await findLocalServer(input.workspaceId);
  if (existing) return existing;

  const server = await prisma.server.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name?.trim() || DEFAULT_LOCAL_SERVER_NAME,
      description: 'The machine Peon is running on.',
      executionMode: 'LOCAL',
      // No SSH is ever attempted, so these are inert placeholders rather than a
      // loopback address — pointing at 127.0.0.1 would suggest SSH is involved.
      ip: LOCAL_HOST,
      port: 22,
      user: 'root',
      privateKeyId: null,
      // Reachability is confirmed by validate(); assume nothing here.
      isReachable: false,
      isUsable: false,
      settings: {
        create: {
          // One build at a time by default: on a single server the control
          // plane and the workloads share CPU, and a parallel Nixpacks build
          // makes the dashboard unusable.
          concurrentBuilds: 1,
          ...(input.wildcardDomain ? { wildcardDomain: input.wildcardDomain } : {}),
        },
      },
      destinations: {
        create: { name: 'default', network: DEFAULT_NETWORK },
      },
    },
  });

  return server;
}

/** True when this server runs on the Peon host. */
export function isLocalServer(server: Pick<Server, 'executionMode'>): boolean {
  return server.executionMode === 'LOCAL';
}

/**
 * Guard for SSH-only fields. Editing an IP, port, user or private key is
 * meaningless for a local server and would imply a transport that is not used.
 */
export function assertRemoteOnlyField(
  server: Pick<Server, 'executionMode'>,
  field: string,
): void {
  if (isLocalServer(server)) {
    throw new Error(`"${field}" does not apply to a local server — it is not reached over SSH.`);
  }
}
