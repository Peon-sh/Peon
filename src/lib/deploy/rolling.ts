import { containerName, sanitizeName } from '@/lib/docker/naming';

/** True when ports include host:container mappings (e.g. 8080:3000). */
export function hasHostPortMappings(ports: string | null | undefined): boolean {
  if (!ports?.trim()) return false;
  return ports.split(',').some((part) => {
    const p = part.trim();
    if (!p) return false;
    // host:container or [ipv6]:container
    return /:\d+\s*$/.test(p) && !/^\d+\s*$/.test(p);
  });
}

export type RollingEligibilityInput = {
  kind: string;
  fqdn?: string | null;
  ports?: string | null;
  isPreview?: boolean;
  rollingUpdate?: boolean | null;
  isConsistentContainerNameEnabled?: boolean | null;
};

/**
 * Coolify-style rolling update is safe when Traefik/Caddy routes by domain
 * (no host port bind) for app-style kinds (not COMPOSE / DATABASE).
 */
export function shouldUseRollingUpdate(input: RollingEligibilityInput): boolean {
  if (input.isPreview) return false;
  if (input.rollingUpdate === false) return false;
  if (input.isConsistentContainerNameEnabled) return false;
  if (input.kind === 'COMPOSE' || input.kind === 'DATABASE') return false;
  if (!input.fqdn?.trim()) return false;
  if (hasHostPortMappings(input.ports)) return false;
  return true;
}

/** Deployment-scoped container name for rolling swaps. */
export function rollingContainerName(serviceName: string, deploymentUuid: string): string {
  return containerName(serviceName, deploymentUuid);
}

/** Compose project name unique per deployment (avoids orphaning the previous container). */
export function rollingComposeProject(serviceUuid: string, deploymentUuid: string): string {
  const a = sanitizeName(serviceUuid).slice(0, 12) || 'svc';
  const b = sanitizeName(deploymentUuid).slice(0, 8) || 'dep';
  return `peon-${a}-${b}`;
}

export const PEON_SERVICE_ID_LABEL = 'peon.serviceId';
export const PEON_DEPLOYMENT_ID_LABEL = 'peon.deploymentId';
export const PEON_ROLE_LABEL = 'peon.role';
