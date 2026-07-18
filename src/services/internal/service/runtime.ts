import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto/encryption';
import { sshPool, type SshTarget } from '@/lib/ssh';
import { parseCompose, pickPrimaryComposeService } from '@/lib/docker/compose';
import { containerName } from '@/lib/docker/naming';
import { dockerExecShellCommand, shellSingleQuote } from '@/lib/shell/quote';
import { AppError, NotFoundError } from '@/lib/errors';

/**
 * Runtime access to a deployed service's container over SSH: log tailing,
 * one-shot command execution, and container resolution for the interactive
 * WebSocket terminal (`docker exec -it` via the worker terminal server).
 */

type ContainerContext = { target: SshTarget; container: string };

const contextCache = new Map<string, { ctx: ContainerContext; expires: number }>();
const CACHE_TTL_MS = 60_000;

async function containerContext(serviceId: string): Promise<ContainerContext> {
  const cached = contextCache.get(serviceId);
  if (cached && cached.expires > Date.now()) return cached.ctx;

  const svc = await prisma.service.findFirst({
    where: { id: serviceId, deletedAt: null },
    select: {
      serverId: true,
      name: true,
      uuid: true,
      kind: true,
      activeContainerName: true,
      dockerComposeRaw: true,
      server: { include: { privateKey: true } },
      settings: { select: { isRawComposeDeploymentEnabled: true } },
    },
  });
  if (!svc) throw new NotFoundError('Service not found.');
  if (!svc.serverId || !svc.server) throw new AppError('Service has no target server.');
  if (!svc.server.privateKey) throw new AppError('Server has no SSH key configured.');

  const target: SshTarget = {
    id: svc.server.id,
    host: svc.server.ip,
    port: svc.server.port,
    username: svc.server.user,
    privateKey: decrypt(svc.server.privateKey.privateKey),
  };

  let container = svc.activeContainerName?.trim() || containerName(svc.name, svc.uuid);

  // Raw compose deploys without injecting Peon container_name — resolve via compose.
  if (svc.kind === 'COMPOSE' && svc.settings?.isRawComposeDeploymentEnabled && svc.dockerComposeRaw) {
    try {
      const { doc } = parseCompose(svc.dockerComposeRaw);
      const services = (doc as { services?: Record<string, Record<string, unknown>> }).services ?? {};
      const primaryKey = pickPrimaryComposeService(services, svc.name);
      const declared = services[primaryKey]?.container_name;
      if (typeof declared === 'string' && declared.trim()) {
        container = declared.trim();
      } else {
        const dir = `/data/peon/services/${svc.uuid}`;
        const idRes = await sshPool.exec(
          target,
          `cd ${shellSingleQuote(dir)} && docker compose ps -q ${shellSingleQuote(primaryKey)} 2>/dev/null | head -1`,
        );
        const id = idRes.stdout.trim();
        if (id) {
          const nameRes = await sshPool.exec(
            target,
            `docker inspect --format='{{.Name}}' ${shellSingleQuote(id)} 2>/dev/null`,
          );
          const resolved = nameRes.stdout.trim().replace(/^\//, '');
          if (resolved) container = resolved;
        }
      }
    } catch {
      // Fall back to Peon naming.
    }
  }

  const ctx = { target, container };
  contextCache.set(serviceId, { ctx, expires: Date.now() + CACHE_TTL_MS });
  return ctx;
}

export const ServiceRuntime = {
  /** Drop cached SSH/container context after a rolling swap. */
  invalidate(serviceId: string) {
    contextCache.delete(serviceId);
  },

  /** Resolve SSH target + container name (cached). Used by exec and interactive terminal. */
  resolveContainer(serviceId: string) {
    return containerContext(serviceId);
  },

  /** Pre-warm the SSH connection for faster subsequent exec calls. */
  async warm(serviceId: string) {
    const { target, container } = await containerContext(serviceId);
    await sshPool.exec(target, 'true');
    return { container, ready: true };
  },

  /** Tail container logs. Pass tail=0 for the full log stream. */
  async logs(serviceId: string, opts: { tail?: number; since?: string; all?: boolean } = {}) {
    const { target, container } = await containerContext(serviceId);
    const all = opts.all || opts.tail === 0;
    const tail = all ? null : Math.min(Math.max(opts.tail ?? 200, 1), 5000);
    const since = opts.since ? ` --since ${JSON.stringify(opts.since)}` : '';
    const tailArg = tail ? ` --tail ${tail}` : '';
    const res = await sshPool.exec(
      target,
      `docker logs${tailArg}${since} --timestamps ${container} 2>&1 || true`,
    );
    return { container, lines: res.stdout.split('\n').filter(Boolean) };
  },

  /** Run a single command inside the service container. */
  async exec(serviceId: string, command: string) {
    const { target, container } = await containerContext(serviceId);
    const res = await sshPool.exec(
      target,
      `${dockerExecShellCommand(container, command)} 2>&1`,
    );
    return { container, code: res.code, output: res.stdout || res.stderr };
  },

  /** Lightweight container status (`docker ps` line) for the runtime panels. */
  async status(serviceId: string) {
    const { target, container } = await containerContext(serviceId);
    const res = await sshPool.exec(
      target,
      `docker ps -a --filter name=^${container}$ --format '{{.Status}}|{{.Image}}' | head -1`,
    );
    const [status, image] = res.stdout.trim().split('|');
    return { container, status: status || 'not created', image: image || null };
  },
};
