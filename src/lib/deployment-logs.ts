import type { LogLine } from '@/services/api/deployment';

/** Plain-text body for downloading deployment build logs. */
export function buildLogsDownloadText(logs: LogLine[]): string {
  return logs.map((l) => l.message).join('\n');
}

export function buildLogsDownloadFilename(uuid: string): string {
  return `deployment-${uuid.slice(0, 12)}-build-logs.txt`;
}
