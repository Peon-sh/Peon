import { randomBytes } from 'node:crypto';

/**
 * Template "magic" environment variable generation (SERVICE_* placeholders).
 *
 * Templates reference variables named `SERVICE_{COMMAND}[_{LENGTH}]_{ID}`
 * (e.g. `SERVICE_PASSWORD_POSTGRES`, `SERVICE_FQDN_N8N_5678`,
 * `SERVICE_BASE64_64_SECRETKEYBASE`). At creation time we scan the compose
 * file, discover every magic key, and generate a concrete value for each so
 * docker compose can interpolate them from the service's `.env`.
 */

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SYMBOLS = '!@#$%^&*()_+';

function randomString(length: number, alphabet: string = ALNUM): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export interface MagicEnvContext {
  /** Used to build unique hostnames, e.g. `n8n-ab12cd`. */
  serviceSlug: string;
  serviceUuid: string;
  /**
   * Base domain for generated FQDNs. Typically `{serverIp}.sslip.io` or the
   * instance wildcard domain. Falls back to `localhost` when unknown.
   */
  baseDomain?: string | null;
  /** Scheme for SERVICE_URL_* values. */
  https?: boolean;
}

/** Extract every distinct `SERVICE_*` magic key referenced in a compose file. */
export function extractMagicKeys(compose: string): string[] {
  const found = new Set<string>();
  const re = /SERVICE_[A-Z0-9_]+/g;
  for (const match of compose.matchAll(re)) {
    // Trim trailing underscores that can appear from ${VAR}_suffix constructs.
    found.add(match[0].replace(/_+$/, ''));
  }
  return [...found];
}

interface ParsedKey {
  command: string;
  length: number | null;
  identifier: string;
  /** Numeric port suffix on FQDN/URL keys, e.g. SERVICE_FQDN_APP_5678. */
  port: number | null;
}

const LENGTH_COMMANDS = new Set(['PASSWORD', 'PASSWORDWITHSYMBOLS', 'BASE64', 'REALBASE64', 'HEX', 'USER']);

function parseMagicKey(key: string): ParsedKey | null {
  const parts = key.split('_');
  if (parts[0] !== 'SERVICE' || parts.length < 3) return null;
  const command = parts[1];
  let idx = 2;
  let length: number | null = null;
  if (LENGTH_COMMANDS.has(command) && /^\d+$/.test(parts[2] ?? '')) {
    length = parseInt(parts[2], 10);
    idx = 3;
  }
  let rest = parts.slice(idx);
  let port: number | null = null;
  if ((command === 'FQDN' || command === 'URL') && rest.length > 1 && /^\d+$/.test(rest[rest.length - 1])) {
    port = parseInt(rest[rest.length - 1], 10);
    rest = rest.slice(0, -1);
  }
  return { command, length, identifier: rest.join('_'), port };
}

function hostFor(ctx: MagicEnvContext): string {
  const base = ctx.baseDomain?.trim() || 'localhost';
  const shortId = ctx.serviceUuid.replace(/-/g, '').slice(0, 8);
  return `${ctx.serviceSlug}-${shortId}.${base}`;
}

function valueFor(parsed: ParsedKey, ctx: MagicEnvContext): string {
  const len = parsed.length ?? 32;
  switch (parsed.command) {
    case 'FQDN':
      return hostFor(ctx);
    case 'URL':
      return `${ctx.https ? 'https' : 'http'}://${hostFor(ctx)}`;
    case 'PASSWORD':
      return randomString(parsed.length === 64 ? 64 : 32);
    case 'PASSWORDWITHSYMBOLS':
      return randomString(parsed.length === 64 ? 64 : 32, ALNUM + SYMBOLS);
    case 'USER':
      return randomString(16);
    case 'LOWERCASEUSER':
      return randomString(16).toLowerCase();
    case 'BASE64':
      return randomString(len);
    case 'REALBASE64':
      return Buffer.from(randomString(len)).toString('base64');
    case 'HEX':
      return randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
    default:
      // Unknown command - behave like a generic secret.
      return randomString(32);
  }
}

/**
 * Generate values for every magic key found in `compose`.
 * FQDN/URL keys sharing the same identifier resolve to the same host, and both
 * variants are always emitted so cross-references inside the template work.
 */
export function generateMagicEnv(compose: string, ctx: MagicEnvContext): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = extractMagicKeys(compose);

  for (const key of keys) {
    const parsed = parseMagicKey(key);
    if (!parsed) continue;
    if (out[key] !== undefined) continue;
    out[key] = valueFor(parsed, ctx);

    // Emit the paired FQDN/URL twin so `$SERVICE_URL_X` works when only
    // `$SERVICE_FQDN_X` was declared, and vice versa.
    if (parsed.command === 'FQDN' || parsed.command === 'URL') {
      const twinCommand = parsed.command === 'FQDN' ? 'URL' : 'FQDN';
      const suffix = parsed.port ? `_${parsed.port}` : '';
      const twinKey = `SERVICE_${twinCommand}_${parsed.identifier}${suffix}`;
      if (out[twinKey] === undefined) {
        out[twinKey] = valueFor({ ...parsed, command: twinCommand }, ctx);
      }
    }
  }
  return out;
}

/** Parse `.env`-style seed lines shipped with a template. */
export function parseEnvSeed(envs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of envs.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
