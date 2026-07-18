/** Pure helpers for Docker cleanup. */

export type CleanupScriptOptions = {
  deleteUnusedVolumes?: boolean;
  deleteUnusedNetworks?: boolean;
};

/** Docker resource cleanup commands. Volumes/networks are opt-in (destructive). */
export function cleanupScript(opts: CleanupScriptOptions = {}): string {
  const lines = [
    'docker image prune -af || true',
    'docker builder prune -af || true',
    'docker container prune -f || true',
  ];
  if (opts.deleteUnusedVolumes) {
    lines.push('docker volume prune -af || true');
  }
  if (opts.deleteUnusedNetworks) {
    lines.push('docker network prune -f || true');
  }
  lines.push('echo "cleanup done"');
  return lines.join('\n');
}

/** Print root filesystem disk usage as an integer percent (0–100). */
export function diskUsagePercentScript(): string {
  return `df / --output=pcent | tr -cd 0-9`;
}

export function parseDiskUsagePercent(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Cleanup gate:
 * - manual or forceDockerCleanup → always run
 * - otherwise run only when disk usage >= threshold
 * - if usage cannot be determined on a scheduled run → still run
 */
export function shouldRunDockerCleanup(input: {
  manual: boolean;
  forceDockerCleanup: boolean;
  diskUsagePercent: number | null;
  threshold: number;
}): { run: boolean; reason: string } {
  if (input.manual) {
    return { run: true, reason: 'manual cleanup' };
  }
  if (input.forceDockerCleanup) {
    return { run: true, reason: 'force docker cleanup enabled' };
  }
  // Treat empty/null/0 as undetermined and still run cleanup.
  if (input.diskUsagePercent === null || input.diskUsagePercent === 0) {
    return { run: true, reason: 'disk usage unavailable; running cleanup' };
  }
  if (input.diskUsagePercent >= input.threshold) {
    return {
      run: true,
      reason: `disk usage ${input.diskUsagePercent}% >= threshold ${input.threshold}%`,
    };
  }
  return {
    run: false,
    reason: `disk usage ${input.diskUsagePercent}% below threshold ${input.threshold}%`,
  };
}
