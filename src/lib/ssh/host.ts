import net from 'node:net';

/**
 * Normalize a user-entered SSH host (IPv4, IPv6, or DNS hostname).
 * - Trims whitespace
 * - Unwraps bracketed IPv6 (`[2001:db8::1]` → `2001:db8::1`)
 */
export function normalizeSshHost(raw: string): string {
  let host = raw.trim();
  // Bracketed IPv6, optionally with `:port` — drop brackets and trailing port.
  if (host.startsWith('[') && host.includes(']')) {
    const end = host.indexOf(']');
    const inside = host.slice(1, end);
    host = inside;
  }
  // Users sometimes paste `user@host` — keep host only.
  const at = host.lastIndexOf('@');
  if (at !== -1) host = host.slice(at + 1);
  return host.trim();
}

/** Strip zone id (`fe80::1%eth0` → `fe80::1`) for net.isIP checks. */
function hostWithoutZone(host: string): string {
  const pct = host.indexOf('%');
  return pct === -1 ? host : host.slice(0, pct);
}

export function isIpv4Literal(host: string): boolean {
  return net.isIP(hostWithoutZone(normalizeSshHost(host))) === 4;
}

export function isIpv6Literal(host: string): boolean {
  return net.isIP(hostWithoutZone(normalizeSshHost(host))) === 6;
}

/** DNS hostname (not a bare IP). Allows `localhost` and multi-label FQDNs. */
export function isDnsHostname(host: string): boolean {
  const h = hostWithoutZone(normalizeSshHost(host)).toLowerCase();
  if (!h || net.isIP(h)) return false;
  if (h === 'localhost') return true;
  // Reject dotted-decimal lookalikes that are not valid IPv4 (e.g. 1.2.3.99999).
  if (/^\d+(\.\d+){3}$/.test(h)) return false;
  // Labels: letter/digit start, alnum/hyphen inside, 1–63 chars.
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/.test(
    h,
  );
}

export function isValidSshHost(raw: string): boolean {
  const host = normalizeSshHost(raw);
  if (!host || host.length > 255) return false;
  return isIpv4Literal(host) || isIpv6Literal(host) || isDnsHostname(host);
}

/**
 * Options for ssh2 / node-ssh when connecting to this host.
 * Literal IPv6 must force the IPv6 stack — otherwise some Node/dns paths fail.
 */
export function sshConnectHostOptions(host: string): {
  host: string;
  forceIPv4?: boolean;
  forceIPv6?: boolean;
} {
  const normalized = normalizeSshHost(host);
  if (isIpv6Literal(normalized)) {
    return { host: normalized, forceIPv6: true };
  }
  if (isIpv4Literal(normalized)) {
    return { host: normalized, forceIPv4: true };
  }
  return { host: normalized };
}
