import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/crypto/encryption';
import { generateProxyLabels } from '@/lib/docker/labels';
import { DEFAULT_NETWORK, sanitizeName } from '@/lib/docker/naming';
import { previewDir } from '@/services/internal/deploy/preview';
import type { Service, ServiceSetting, PrivateKey, GithubApp } from '@/lib/prisma';

/**
 * Root for everything Peon writes on a target machine.
 *
 * Read from the environment rather than hardcoded because under **local**
 * execution this path has to mean the same thing to three different actors: the
 * worker process (which writes compose files), the Docker daemon (which resolves
 * bind mounts against the *host* filesystem), and the containers themselves. The
 * worker container must therefore mount it at the identical absolute path.
 *
 * See docs/server-modes.md — getting this wrong makes deployments mount the
 * wrong directory silently rather than failing loudly.
 */
export function peonDataDir(): string {
  return process.env.PEON_DATA_DIR?.trim() || '/data/peon';
}

export function servicesBaseDir(): string {
  return `${peonDataDir()}/services`;
}

/** @deprecated Use {@link servicesBaseDir}; kept so existing imports resolve. */
export const BASE_DIR = '/data/peon/services';

export type FullService = Service & {
  settings: ServiceSetting | null;
  privateKey: PrivateKey | null;
  githubApp: (GithubApp & { privateKey: PrivateKey | null }) | null;
};

/**
 * HTTP healthcheck: curl with wget fallback (containers rarely
 * ship both), checking the configured method/scheme/host/port/path, expected
 * status code, and optional response-body text.
 *
 * Note: Compose interpolates `$VAR` in the file, so every `$` in the shell
 * snippet must be written as `$$` (handled in buildCompose).
 */
export function buildHealthcheck(svc: FullService, defaultPort: number) {
  if (!svc.healthCheckEnabled) return undefined;
  const scheme = svc.healthCheckScheme || 'http';
  const host = svc.healthCheckHost || 'localhost';
  const port = svc.healthCheckPort || String(defaultPort);
  const path = svc.healthCheckPath || '/';
  const method = (svc.healthCheckMethod || 'GET').toUpperCase();
  const url = `${scheme}://${host}:${port}${path.startsWith('/') ? path : `/${path}`}`;
  const expectCode = svc.healthCheckReturnCode || 200;
  const responseText = svc.healthCheckResponseText?.trim();

  // Accept the configured code, and also 3xx when expecting 200 — Next.js apps
  // often redirect `/` to `/login`, which would otherwise keep the container
  // "unhealthy" and Traefik would stop routing to it.
  const codeCheck =
    expectCode === 200
      ? `[ "$out" = "200" ] || [ "$out" -ge 300 -a "$out" -lt 400 ]`
      : `[ "$out" = "${expectCode}" ]`;

  const curlCheck = responseText
    ? `out=$(curl -s -X ${method} -o /tmp/hc_body -w '%{http_code}' ${url}) && ${codeCheck} && grep -q ${JSON.stringify(responseText)} /tmp/hc_body`
    : `out=$(curl -s -X ${method} -o /dev/null -w '%{http_code}' ${url}) && ${codeCheck}`;
  const wgetFallback = `wget -q --spider ${url}`;
  const cmd = `if command -v curl >/dev/null 2>&1; then ${curlCheck}; else ${wgetFallback}; fi || exit 1`;

  return {
    test: ['CMD-SHELL', cmd],
    interval: `${svc.healthCheckInterval || 5}s`,
    timeout: `${svc.healthCheckTimeout || 5}s`,
    retries: svc.healthCheckRetries || 10,
    startPeriod: `${svc.healthCheckStartPeriod || 5}s`,
  };
}

export function serviceDir(svc: Service, pullRequestId?: number | null): string {
  if (pullRequestId != null) return previewDir(svc.uuid, pullRequestId);
  return `${servicesBaseDir()}/${svc.uuid}`;
}

export async function buildEnvMap(
  serviceId: string,
  opts: { isPreview: boolean; phase: 'build' | 'runtime' },
): Promise<Record<string, string>> {
  const phaseFilter = opts.phase === 'build' ? { isBuildtime: true } : { isRuntime: true };
  // Production → only production vars. Preview → only preview-section vars
  // (same key may exist in both with different values via serviceId+key+isPreview).
  const vars = await prisma.environmentVariable.findMany({
    where: {
      serviceId,
      ...phaseFilter,
      isPreview: opts.isPreview,
    },
    orderBy: { key: 'asc' },
  });
  const map: Record<string, string> = {};
  for (const v of vars) {
    try {
      map[v.key] = decrypt(v.value);
    } catch {
      map[v.key] = v.value;
    }
  }
  return map;
}

export function proxyLabelsFor(
  svc: FullService,
  name: string,
  port: number,
  proxyType: 'TRAEFIK' | 'CADDY',
  fqdnOverride?: string | null,
): string[] {
  const fqdn = fqdnOverride ?? svc.fqdn;
  if (!fqdn) return [];
  const domains = fqdn.split(',').map((d) => d.trim()).filter(Boolean);
  return generateProxyLabels(proxyType, {
    name,
    domains,
    port,
    forceHttps: svc.settings?.isForceHttpsEnabled ?? true,
    gzip: svc.settings?.isGzipEnabled ?? true,
    stripPrefix: svc.settings?.isStripprefixEnabled ? '/' : undefined,
    network: DEFAULT_NETWORK,
  });
}

export function volumesFor(volumes: { name: string; mountPath: string; hostPath: string | null; isBindMount: boolean }[]): {
  volumeStrings: string[];
  named: string[];
} {
  const volumeStrings: string[] = [];
  const named: string[] = [];
  for (const v of volumes) {
    if (v.isBindMount && v.hostPath) {
      volumeStrings.push(`${v.hostPath}:${v.mountPath}`);
    } else {
      const volName = sanitizeName(v.name);
      volumeStrings.push(`${volName}:${v.mountPath}`);
      named.push(volName);
    }
  }
  return { volumeStrings, named };
}

/** Serialize an env map as a docker-compose-compatible `.env` file. */
export function envFileContent(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n'
  );
}
