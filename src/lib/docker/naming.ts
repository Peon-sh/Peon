/** Deterministic, DNS-safe container/name helpers. */

export function sanitizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Container name for a service deployment, e.g. `myapp-abc123`. */
export function containerName(serviceName: string, serviceUuid: string): string {
  return `${sanitizeName(serviceName).slice(0, 32)}-${serviceUuid.slice(0, 8)}`;
}

/**
 * Traefik/Caddy router + service id used in proxy labels.
 * Production stays stable across rolling swaps (same backend briefly shared).
 * Previews must be unique or they overwrite production Host()/TLS rules.
 */
export function proxyRouterName(opts: {
  isPreview: boolean;
  /** Preview (or rolling) container name — already unique per PR/deploy. */
  deploymentContainerName: string;
  serviceName: string;
  serviceUuid: string;
}): string {
  if (opts.isPreview) return opts.deploymentContainerName;
  return containerName(opts.serviceName, opts.serviceUuid);
}

export const DEFAULT_NETWORK = 'peon';
