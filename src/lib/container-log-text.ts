/** Last N lines copied off a container before it is removed. */
export const CONTAINER_LOG_MAX_LINES = 5000;
/** Hard cap so one archive cannot grow the database without bound. */
export const CONTAINER_LOG_MAX_BYTES = 1_048_576;
export const CONTAINER_LOGS_KEPT = 5;

export type ContainerLogReason = 'deploy' | 'rolling' | 'cleanup';

export interface ArchivedContainerLog {
  containerName: string;
  reason: string;
  capturedAt: Date | string;
  content: string;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Keep the newest lines, then trim from the front until the text fits in 1 MB.
 * A trailing newline from `docker logs` is dropped so it does not become a blank line.
 */
export function capContainerLog(raw: string): string {
  const trimmed = raw.replace(/\s+$/u, '');
  if (!trimmed) return '';

  let lines = trimmed.split('\n');
  if (lines.length > CONTAINER_LOG_MAX_LINES) {
    lines = lines.slice(-CONTAINER_LOG_MAX_LINES);
  }

  let text = lines.join('\n');
  if (byteLength(text) <= CONTAINER_LOG_MAX_BYTES) return text;

  while (lines.length > 1 && byteLength(lines.join('\n')) > CONTAINER_LOG_MAX_BYTES) {
    lines.shift();
  }
  text = lines.join('\n');
  if (byteLength(text) > CONTAINER_LOG_MAX_BYTES) {
    text = text.slice(-CONTAINER_LOG_MAX_BYTES);
  }
  return text;
}

/** `docker inspect` lines of `/name|serviceId` for containers cleanup is about to prune. */
export function parseStoppedContainerInspect(
  stdout: string,
): { containerName: string; serviceId: string }[] {
  const rows: { containerName: string; serviceId: string }[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    const splitAt = trimmed.indexOf('|');
    if (splitAt <= 0) continue;
    const containerName = trimmed.slice(0, splitAt).replace(/^\//, '').trim();
    const serviceId = trimmed.slice(splitAt + 1).trim();
    if (!containerName || !serviceId) continue;
    rows.push({ containerName, serviceId });
  }
  return rows;
}

function reasonLabel(reason: string): string {
  if (reason === 'rolling') return 'rolling update';
  if (reason === 'cleanup') return 'server cleanup';
  return 'deploy';
}

function capturedAtLabel(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Oldest archive first, then the live tail. With no archives this is just the
 * live lines, so a service that has never been replaced looks the same as before.
 */
export function combineServiceLogs(
  archivesNewestFirst: ArchivedContainerLog[],
  liveLines: string[],
): string {
  const chunks: string[] = [];
  for (const archive of [...archivesNewestFirst].reverse()) {
    chunks.push(
      `----- previous container ${archive.containerName} (${reasonLabel(archive.reason)}, ${capturedAtLabel(archive.capturedAt)}) -----`,
      archive.content,
    );
  }
  if (liveLines.length) {
    if (chunks.length) chunks.push('----- current container -----');
    chunks.push(liveLines.join('\n'));
  }
  return chunks.join('\n');
}
