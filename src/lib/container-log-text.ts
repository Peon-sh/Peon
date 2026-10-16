/** Last N lines copied off a container before it is removed. */
export const CONTAINER_LOG_MAX_LINES = 5000;
/** Hard cap so one archive object in S3 cannot grow without bound. */
export const CONTAINER_LOG_MAX_BYTES = 1_048_576;
export const CONTAINER_LOGS_KEPT = 5;

export type ContainerLogReason = 'deploy' | 'rolling' | 'cleanup';

export interface ArchivedContainerLog {
  containerName: string;
  reason: ContainerLogReason;
  capturedAt: Date | string;
  content: string;
}

/**
 * A preview container is thrown away with the preview. Archiving it under the
 * production service would rotate out that service's retained logs.
 * Rolling updates archive later, when the previous container is removed.
 */
export function shouldArchiveReplacedContainer(input: {
  useRolling: boolean;
  isPreview: boolean;
}): boolean {
  return !input.useRolling && !input.isPreview;
}

/** Keep the newest bytes of `buf`, starting on a UTF-8 character boundary. */
function utf8Tail(buf: Buffer, maxBytes: number): string {
  let start = Math.max(0, buf.length - maxBytes);
  while (start < buf.length && (buf[start]! & 0xc0) === 0x80) start += 1;
  return buf.subarray(start).toString('utf8');
}

/**
 * Keep the newest lines, then the newest bytes, within 1 MB.
 * A trailing newline from `docker logs` is dropped so it does not become a blank line.
 */
export function capContainerLog(raw: string): string {
  const trimmed = raw.replace(/\s+$/u, '');
  if (!trimmed) return '';

  const lines = trimmed.split('\n');
  const newest =
    lines.length > CONTAINER_LOG_MAX_LINES ? lines.slice(-CONTAINER_LOG_MAX_LINES) : lines;

  const encoded = Buffer.from(newest.join('\n'), 'utf8');
  if (encoded.length <= CONTAINER_LOG_MAX_BYTES) return encoded.toString('utf8');

  const lineBytes = newest.map((line) => Buffer.byteLength(line, 'utf8'));
  let total = encoded.length;
  let startLine = 0;
  while (startLine < newest.length - 1 && total > CONTAINER_LOG_MAX_BYTES) {
    total -= lineBytes[startLine]! + 1;
    startLine += 1;
  }

  const kept = Buffer.from(newest.slice(startLine).join('\n'), 'utf8');
  if (kept.length <= CONTAINER_LOG_MAX_BYTES) return kept.toString('utf8');
  return utf8Tail(kept, CONTAINER_LOG_MAX_BYTES);
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

function reasonLabel(reason: ContainerLogReason): string {
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
