/**
 * Proxy label generation for Traefik and Caddy. Pure functions so they can be
 * unit-tested and reused by the worker deployment handlers.
 */

export interface ProxyLabelOptions {
  /** Unique service/container identifier used as the router name. */
  name: string;
  /** Fully-qualified domains (may include path via `https://host/path`). */
  domains: string[];
  /** Internal container port the app listens on. */
  port: number;
  /** Redirect HTTP -> HTTPS. */
  forceHttps?: boolean;
  /** Enable gzip compression middleware. */
  gzip?: boolean;
  /** Strip a path prefix before proxying. */
  stripPrefix?: string;
  /** Docker network the proxy uses. */
  network?: string;
}

interface ParsedDomain {
  scheme: 'http' | 'https';
  host: string;
  path?: string;
}

export function parseDomain(input: string): ParsedDomain {
  let scheme: 'http' | 'https' = 'https';
  let rest = input.trim();
  if (rest.startsWith('http://')) {
    scheme = 'http';
    rest = rest.slice('http://'.length);
  } else if (rest.startsWith('https://')) {
    scheme = 'https';
    rest = rest.slice('https://'.length);
  }
  const slash = rest.indexOf('/');
  if (slash === -1) return { scheme, host: rest };
  return { scheme, host: rest.slice(0, slash), path: rest.slice(slash) };
}

function traefikRule(d: ParsedDomain): string {
  const host = `Host(\`${d.host}\`)`;
  if (d.path && d.path !== '/') return `${host} && PathPrefix(\`${d.path}\`)`;
  return host;
}

/** Generate Traefik v2/v3 container labels. */
export function generateTraefikLabels(opts: ProxyLabelOptions): string[] {
  const labels: string[] = ['traefik.enable=true'];
  if (opts.network) labels.push(`traefik.docker.network=${opts.network}`);

  const domains = opts.domains.map(parseDomain).filter((d) => d.host);
  if (domains.length === 0) return labels;

  domains.forEach((d, i) => {
    const router = `${opts.name}-${i}`;
    const rule = traefikRule(d);
    const isHttps = d.scheme === 'https';
    const entry = isHttps ? 'https' : 'http';

    labels.push(`traefik.http.routers.${router}.rule=${rule}`);
    labels.push(`traefik.http.routers.${router}.entryPoints=${entry}`);
    labels.push(`traefik.http.routers.${router}.service=${opts.name}`);

    if (isHttps) {
      labels.push(`traefik.http.routers.${router}.tls=true`);
      labels.push(`traefik.http.routers.${router}.tls.certresolver=letsencrypt`);
    }

    const middlewares: string[] = [];
    if (opts.gzip) {
      labels.push(`traefik.http.middlewares.${opts.name}-gzip.compress=true`);
      middlewares.push(`${opts.name}-gzip`);
    }
    if (opts.stripPrefix) {
      labels.push(
        `traefik.http.middlewares.${opts.name}-sp.stripprefix.prefixes=${opts.stripPrefix}`,
      );
      middlewares.push(`${opts.name}-sp`);
    }
    if (isHttps && opts.forceHttps) {
      labels.push(
        `traefik.http.middlewares.${opts.name}-redir.redirectscheme.scheme=https`,
      );
      // HTTP router that redirects to HTTPS.
      const redirRouter = `${opts.name}-${i}-http`;
      labels.push(`traefik.http.routers.${redirRouter}.rule=${rule}`);
      labels.push(`traefik.http.routers.${redirRouter}.entryPoints=http`);
      labels.push(`traefik.http.routers.${redirRouter}.middlewares=${opts.name}-redir`);
    }
    if (middlewares.length) {
      labels.push(`traefik.http.routers.${router}.middlewares=${middlewares.join(',')}`);
    }
  });

  labels.push(`traefik.http.services.${opts.name}.loadbalancer.server.port=${opts.port}`);
  return labels;
}

/** Generate Caddy labels (caddy-docker-proxy style). */
export function generateCaddyLabels(opts: ProxyLabelOptions): string[] {
  const labels: string[] = [];
  const domains = opts.domains.map(parseDomain).filter((d) => d.host);
  domains.forEach((d) => {
    const key = d.scheme === 'https' ? d.host : `http://${d.host}`;
    labels.push(`caddy=${key}`);
    labels.push(`caddy.reverse_proxy={{upstreams ${opts.port}}}`);
    if (opts.gzip) labels.push('caddy.encode=gzip');
    if (opts.stripPrefix) labels.push(`caddy.uri=strip_prefix ${opts.stripPrefix}`);
  });
  return labels;
}

export function generateProxyLabels(
  proxy: 'TRAEFIK' | 'CADDY' | 'NONE',
  opts: ProxyLabelOptions,
): string[] {
  if (proxy === 'TRAEFIK') return generateTraefikLabels(opts);
  if (proxy === 'CADDY') return generateCaddyLabels(opts);
  return [];
}
