/**
 * Canonical filesystem layout for everything Peon writes on a target machine.
 *
 * Single source of truth so the root can be relocated with `PEON_DATA_DIR` and
 * so no module reintroduces a hardcoded `/data/peon`.
 *
 * ## Why this is configurable at all
 *
 * Under **remote** execution the path is unambiguous: the worker's commands run
 * on the remote host, so the worker and the Docker daemon see the same
 * filesystem by construction.
 *
 * Under **local** execution the worker is usually itself a container, and three
 * actors see three different filesystems — the worker, the host, and the Docker
 * daemon (which resolves bind mounts against the *host*). The worker container
 * must therefore mount this directory at the **identical absolute path**:
 *
 *     volumes:
 *       - ${PEON_DATA_DIR:-/data/peon}:${PEON_DATA_DIR:-/data/peon}
 *
 * Get that wrong and deployments mount the wrong directory silently rather than
 * failing. See docs/server-modes.md.
 *
 * Read from `process.env` directly rather than `serverEnv()` so these helpers
 * stay usable from scripts and from modules that must not pull in the env schema.
 */

export const DEFAULT_DATA_DIR = '/data/peon';

/** Root for service directories, backups, proxy config and local storage. */
export function peonDataDir(): string {
  const raw = process.env.PEON_DATA_DIR?.trim();
  if (!raw) return DEFAULT_DATA_DIR;
  // Trailing slashes would produce `//` in every derived path.
  return raw.replace(/\/+$/, '') || DEFAULT_DATA_DIR;
}

/** Per-service compose file, `.env` and cloned source. */
export function servicesBaseDir(): string {
  return `${peonDataDir()}/services`;
}

/** Database dumps, before upload to a storage provider. */
export function backupsDir(): string {
  return `${peonDataDir()}/backups`;
}

/** Traefik / Caddy compose file and ACME storage. */
export function proxyDir(): string {
  return `${peonDataDir()}/proxy`;
}

/** peon-ping-pong monitoring agent state. */
export function agentDir(): string {
  return `${peonDataDir()}/ping-pong`;
}

/** Local object storage (avatars, deployment screenshots). */
export function storageDir(): string {
  return `${peonDataDir()}/storage`;
}

/** Directory for one service's deployment, production or preview. */
export function serviceDirFor(serviceUuid: string, pullRequestId?: number | null): string {
  const base = `${servicesBaseDir()}/${serviceUuid}`;
  return pullRequestId != null ? `${base}/pr-${pullRequestId}` : base;
}
