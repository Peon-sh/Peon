/**
 * Preview URLs under a server wildcard domain, e.g.
 * wildcard `https://preview.peon.sh` + sha `abc1234def…` → `https://abc1234.preview.peon.sh`.
 */

/** Host only from a stored wildcard (scheme, path, and leading `*.` stripped). */
export function parseWildcardBaseHost(wildcardDomain: string): string | null {
  let host = wildcardDomain.trim();
  if (!host) return null;
  host = host.replace(/^https?:\/\//i, '');
  host = host.split('/')[0] ?? '';
  host = host.replace(/:\d+$/, '');
  host = host.replace(/^\*\./, '');
  host = host.toLowerCase();
  return host || null;
}

/** DNS-safe label from a git commit SHA (short, lowercase hex). */
export function previewLabelFromCommitSha(commitSha: string, length = 7): string {
  const cleaned = commitSha.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!cleaned) return 'preview';
  return cleaned.slice(0, Math.min(Math.max(length, 7), 40));
}

export function buildPreviewHostname(commitSha: string, wildcardDomain: string): string | null {
  const host = parseWildcardBaseHost(wildcardDomain);
  if (!host) return null;
  return `${previewLabelFromCommitSha(commitSha)}.${host}`;
}

export function buildPreviewFqdn(commitSha: string, wildcardDomain: string): string | null {
  const hostname = buildPreviewHostname(commitSha, wildcardDomain);
  return hostname ? `https://${hostname}` : null;
}
