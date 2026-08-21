import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ValidationError } from '@/lib/errors';

/**
 * Guards for URLs the control plane fetches on a user's behalf. Private LAN
 * ranges stay reachable so self-hosted instances can point at their own Git
 * server or apps; what is blocked is the infrastructure a request should never
 * reach — cloud metadata and loopback. Resolution happens here and the
 * connection later, so DNS rebinding is not covered.
 */

/** IPv4 addresses no user-supplied URL has a reason to reach. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // unspecified / "this network"
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — AWS/GCP/Azure metadata
  ['100.100.100.200', 32], // Alibaba metadata; rest of carrier NAT stays open for Tailscale
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255
];

/** AWS instance metadata over IPv6; the rest of `fc00::/7` stays reachable. */
const AWS_IPV6_METADATA = [0xfd00, 0x0ec2, 0, 0, 0, 0, 0, 0x0254];

function ipv4Bytes(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

function toUint32(bytes: number[]): number {
  return ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
}

function isAllowedIpv4(bytes: number[]): boolean {
  const addr = toUint32(bytes);
  for (const [base, bits] of BLOCKED_V4) {
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    if (((addr & mask) >>> 0) === ((toUint32(ipv4Bytes(base)!) & mask) >>> 0)) return false;
  }
  return true;
}

/** Expand an IPv6 literal into its eight 16-bit groups. */
function ipv6Groups(value: string): number[] | null {
  const halves = value.split('%')[0]!.split('::');
  if (halves.length > 2) return null;

  const expand = (segment: string): number[] | null => {
    if (!segment) return [];
    const chunks = segment.split(':');
    const out: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      if (chunk.includes('.')) {
        // A dotted-quad tail is only legal as the final element.
        if (i !== chunks.length - 1) return null;
        const v4 = ipv4Bytes(chunk);
        if (!v4) return null;
        out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(chunk)) return null;
      out.push(parseInt(chunk, 16));
    }
    return out;
  };

  const head = expand(halves[0] ?? '');
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;

  const tail = expand(halves[1] ?? '');
  if (!tail) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...Array<number>(fill).fill(0), ...tail];
}

function embeddedIpv4(groups: number[], at: number): number[] {
  const a = groups[at]!;
  const b = groups[at + 1]!;
  return [a >> 8, a & 0xff, b >> 8, b & 0xff];
}

function isAllowedIpv6(groups: number[]): boolean {
  const zeroHead = groups.slice(0, 5).every((g) => g === 0);
  const isMapped = zeroHead && groups[5] === 0xffff;
  const isTranslated =
    groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);
  // Forms that carry an IPv4 destination are judged as that address.
  if (isMapped || isTranslated) return isAllowedIpv4(embeddedIpv4(groups, 6));
  if (groups[0] === 0x2002) return isAllowedIpv4(embeddedIpv4(groups, 1));

  if (groups.every((g) => g === 0)) return false;
  if (zeroHead && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return false;
  if (groups.every((g, i) => g === AWS_IPV6_METADATA[i])) return false;

  const first = groups[0]!;
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
}

/** True when a URL may be fetched at this address. */
export function isAllowedEgressAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const bytes = ipv4Bytes(ip);
    return bytes ? isAllowedIpv4(bytes) : false;
  }
  if (version === 6) {
    const groups = ipv6Groups(ip);
    return groups ? isAllowedIpv6(groups) : false;
  }
  return false;
}

export interface EgressOptions {
  /** Permit plain `http://` as well as `https://`. */
  allowHttp?: boolean;
  /** Prefix for the thrown message, e.g. "Webhook URL". */
  label?: string;
}

async function resolveAll(hostname: string, label: string): Promise<string[]> {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) throw new Error('empty');
    return records.map((r) => r.address);
  } catch {
    throw new ValidationError(
      `${label} host could not be resolved: ${hostname}. Check the spelling and try again.`,
    );
  }
}

/** Validate that `raw` is a fetchable HTTP(S) URL, or throw explaining why not. */
export async function assertSafeEgressUrl(raw: string, opts: EgressOptions = {}): Promise<URL> {
  const label = opts.label ?? 'URL';

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError(`${label} is not a valid URL. Check for a typo or a missing https://.`);
  }

  const schemes = opts.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!schemes.includes(url.protocol)) {
    throw new ValidationError(`${label} must use ${opts.allowHttp ? 'http or https' : 'https'}.`);
  }
  if (url.username || url.password) {
    throw new ValidationError(`${label} must not embed credentials.`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) throw new ValidationError(`${label} has no host.`);

  // Any address a host resolves to could be the one connected to.
  const addresses = isIP(hostname) ? [hostname] : await resolveAll(hostname, label);
  for (const address of addresses) {
    if (!isAllowedEgressAddress(address)) {
      throw new ValidationError(
        `${label} points to a restricted address (${address}) that Peon isn't allowed to call. Use a public URL, or a machine on your own network — not localhost or cloud metadata.`,
      );
    }
  }

  return url;
}

/**
 * Custom S3-compatible endpoints are optional; when set they must be fetchable.
 * Host-only values (`minio.example.com:9000`) are treated as https for the check
 * so existing MinIO configs without a scheme still validate.
 */
export async function assertSafeS3Endpoint(endpoint: string | null | undefined): Promise<void> {
  const trimmed = endpoint?.trim();
  if (!trimmed) return;
  const value = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  await assertSafeEgressUrl(value, { allowHttp: true, label: 'S3 endpoint' });
}
