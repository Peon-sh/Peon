import { stringify, parse, Scalar } from 'yaml';
import { containerName, DEFAULT_NETWORK, sanitizeName } from './naming';
import { mergeDockerRunIntoService } from './run-options';

export interface ComposeServiceSpec {
  containerName: string;
  image: string;
  env?: Record<string, string>;
  labels?: string[];
  ports?: string[]; // "host:container"
  volumes?: string[]; // "name:/path" or "/host:/path"
  command?: string | string[];
  restart?: string;
  networks?: string[];
  healthcheck?: {
    test: string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    startPeriod?: string;
  };
  dependsOn?: string[];
  cpuLimit?: string;
  memoryLimit?: string;
  stopGracePeriod?: number;
  /** Extra docker run flags merged into this service. */
  customDockerRunOptions?: string | null;
}

export interface ComposeSpec {
  services: Record<string, ComposeServiceSpec>;
  namedVolumes?: string[];
  network?: string;
}

/**
 * Force a double-quoted YAML scalar. Unquoted strings with `&&` break because
 * YAML treats `&` as an anchor marker, and Compose then splits/truncates the
 * command (e.g. `pnpm … && pnpm start` becomes only `pnpm … deploy`).
 */
function quotedString(value: string): Scalar {
  const scalar = new Scalar(value);
  scalar.type = Scalar.QUOTE_DOUBLE;
  return scalar;
}

/**
 * Docker Compose interpolates `$VAR` / `${VAR}` in the compose file. Shell
 * snippets (healthchecks, commands) must use `$$` for a literal `$`.
 */
export function escapeComposeDollars(value: string): string {
  // Replacement strings treat `$$` as a literal `$`, so emit four dollars to
  // get two in the output (Compose needs `$$` for a literal `$`).
  return value.replaceAll('$', '$$$$');
}

/** Build a docker-compose v3 document from a high-level spec. */
export function buildCompose(spec: ComposeSpec): string {
  const network = spec.network ?? DEFAULT_NETWORK;
  const services: Record<string, unknown> = {};

  for (const [key, s] of Object.entries(spec.services)) {
    const svc: Record<string, unknown> = {
      image: s.image,
      container_name: s.containerName,
      restart: s.restart ?? 'unless-stopped',
      networks: s.networks ?? [network],
    };
    if (s.env && Object.keys(s.env).length) svc.environment = s.env;
    if (s.labels?.length) svc.labels = s.labels;
    if (s.ports?.length) svc.ports = s.ports;
    if (s.volumes?.length) svc.volumes = s.volumes;
    if (s.command) {
      // Nixpacks images use ENTRYPOINT ["/bin/bash","-l","-c"]. Compose turns a
      // plain string command into a space-split argv list (and YAML `&` in `&&`
      // truncates further), so bash -c only runs the first token. Emit a
      // one-element list so the full shell script is a single -c argument.
      if (typeof s.command === 'string') {
        svc.command = [quotedString(escapeComposeDollars(s.command))];
      } else {
        svc.command = s.command;
      }
    }
    if (s.dependsOn?.length) svc.depends_on = s.dependsOn;
    if (s.stopGracePeriod) svc.stop_grace_period = `${s.stopGracePeriod}s`;
    if (s.healthcheck) {
      svc.healthcheck = {
        test: s.healthcheck.test.map((part) =>
          typeof part === 'string' ? escapeComposeDollars(part) : part,
        ),
        interval: s.healthcheck.interval ?? '10s',
        timeout: s.healthcheck.timeout ?? '5s',
        retries: s.healthcheck.retries ?? 3,
        ...(s.healthcheck.startPeriod ? { start_period: s.healthcheck.startPeriod } : {}),
      };
    }
    if (s.cpuLimit || s.memoryLimit) {
      svc.deploy = {
        resources: {
          limits: {
            ...(s.cpuLimit ? { cpus: s.cpuLimit } : {}),
            ...(s.memoryLimit ? { memory: s.memoryLimit } : {}),
          },
        },
      };
    }
    services[key] = mergeDockerRunIntoService(svc, network, s.customDockerRunOptions);
  }

  const doc: Record<string, unknown> = {
    services,
    networks: { [network]: { external: true } },
  };

  if (spec.namedVolumes?.length) {
    doc.volumes = Object.fromEntries(spec.namedVolumes.map((v) => [v, null]));
  }

  return stringify(doc, { lineWidth: 0 });
}

/** Parse a raw compose file, returning service names and the parsed doc. */
export function parseCompose(raw: string): { services: string[]; doc: unknown } {
  const doc = parse(raw) as { services?: Record<string, unknown> };
  return { services: Object.keys(doc?.services ?? {}), doc };
}

export type PrepareRawComposeOptions = {
  /** Peon service display name — primary container uses containerName(this, uuid). */
  serviceName: string;
  serviceUuid: string;
  /** Shared proxy network (created as external). */
  network?: string;
  /** Proxy labels merged onto the primary (HTTP) service only. */
  proxyLabels?: string[];
};

export type PreparedCompose = {
  yaml: string;
  primaryServiceKey: string;
  primaryContainerName: string;
  containerNames: Record<string, string>;
};

const DB_SERVICE_KEYS =
  /^(db|database|postgres|postgresql|mysql|mariadb|mongo|mongodb|redis|valkey|keydb|dragonfly|clickhouse|meilisearch|typesense|elasticsearch|opensearch|rabbitmq|nats|minio)$/i;
const DB_IMAGE_HINT =
  /(postgres|mysql|mariadb|mongo|redis|valkey|clickhouse|meili|typesense|elastic|opensearch|rabbitmq|nats|minio)/i;

function isDatabaseish(key: string, svc: Record<string, unknown>): boolean {
  if (DB_SERVICE_KEYS.test(key)) return true;
  const image = typeof svc.image === 'string' ? svc.image : '';
  return DB_IMAGE_HINT.test(image);
}

/** Pick the HTTP/app service Peon should treat as the main container. */
export function pickPrimaryComposeService(
  services: Record<string, Record<string, unknown>>,
  serviceName: string,
): string {
  const keys = Object.keys(services);
  if (keys.length === 0) throw new Error('Compose file has no services.');
  const want = sanitizeName(serviceName);
  const exact = keys.find((k) => sanitizeName(k) === want);
  if (exact) return exact;
  const nonDb = keys.filter((k) => !isDatabaseish(k, services[k]!));
  return nonDb[0] ?? keys[0]!;
}

/**
 * Infer the published app port from SERVICE_URL_/SERVICE_FQDN_ *_{port} magic
 * keys or a simple ports mapping; defaults to 3000.
 */
export function detectComposeServicePort(
  serviceKey: string,
  svc: Record<string, unknown>,
  composeRaw: string,
  fallback = 3000,
): number {
  const id = serviceKey.replace(/-/g, '_').toUpperCase();
  const magic = composeRaw.match(new RegExp(`SERVICE_(?:URL|FQDN)_${id}_(\\d+)`, 'i'));
  if (magic?.[1]) {
    const port = Number(magic[1]);
    if (Number.isFinite(port) && port > 0) return port;
  }

  const ports = svc.ports;
  if (Array.isArray(ports) && ports.length > 0) {
    const first = String(ports[0]);
    // "3000", "3000:3000", "127.0.0.1:3000:3000"
    const parts = first.split(':');
    const containerPort = Number(parts[parts.length - 1]);
    if (Number.isFinite(containerPort) && containerPort > 0) return containerPort;
  }

  return fallback;
}

function asLabelList(existing: unknown): string[] {
  if (!existing) return [];
  if (Array.isArray(existing)) return existing.map(String);
  if (typeof existing === 'object') {
    return Object.entries(existing as Record<string, unknown>).map(([k, v]) => `${k}=${v}`);
  }
  return [];
}

function mergeLabels(svc: Record<string, unknown>, extra: string[]): void {
  if (!extra.length) return;
  const labels = asLabelList(svc.labels);
  for (const line of extra) {
    const key = line.split('=')[0] ?? line;
    const filtered = labels.filter((l) => l !== line && !l.startsWith(`${key}=`));
    labels.length = 0;
    labels.push(...filtered, line);
  }
  svc.labels = labels;
}

function ensureServiceOnNetwork(svc: Record<string, unknown>, network: string): void {
  const existing = svc.networks;
  if (!existing) {
    svc.networks = [network];
    return;
  }
  if (Array.isArray(existing)) {
    if (!existing.map(String).includes(network)) svc.networks = [...existing.map(String), network];
    return;
  }
  if (typeof existing === 'object') {
    const map = { ...(existing as Record<string, unknown>) };
    if (!(network in map)) map[network] = null;
    svc.networks = map;
  }
}

/**
 * Rewrite of a marketplace/raw compose file before `docker compose up`:
 * deterministic container_name per service (so logs/status/readiness match Peon),
 * attach the shared proxy network, and merge Traefik/Caddy labels onto the primary app.
 */
export function prepareRawCompose(raw: string, opts: PrepareRawComposeOptions): PreparedCompose {
  const network = opts.network ?? DEFAULT_NETWORK;
  const doc = parse(raw) as {
    services?: Record<string, Record<string, unknown>>;
    networks?: Record<string, unknown>;
  };
  const services = doc.services;
  if (!services || Object.keys(services).length === 0) {
    throw new Error('Compose file has no services.');
  }

  const primaryServiceKey = pickPrimaryComposeService(services, opts.serviceName);
  const primaryContainerName = containerName(opts.serviceName, opts.serviceUuid);
  const containerNames: Record<string, string> = {};

  for (const [key, svc] of Object.entries(services)) {
    const name =
      key === primaryServiceKey ? primaryContainerName : containerName(key, opts.serviceUuid);
    svc.container_name = name;
    containerNames[key] = name;
    if (!svc.restart) svc.restart = 'unless-stopped';
    ensureServiceOnNetwork(svc, network);
    if (key === primaryServiceKey && opts.proxyLabels?.length) {
      mergeLabels(svc, opts.proxyLabels);
    }
  }

  doc.networks = { ...(doc.networks ?? {}), [network]: { external: true } };

  return {
    yaml: stringify(doc, { lineWidth: 0 }),
    primaryServiceKey,
    primaryContainerName,
    containerNames,
  };
}
