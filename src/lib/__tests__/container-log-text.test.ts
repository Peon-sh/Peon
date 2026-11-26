import { describe, expect, it } from 'vitest';
import {
  capContainerLog,
  combineServiceLogs,
  CONTAINER_LOG_MAX_BYTES,
  CONTAINER_LOG_MAX_LINES,
  parseStoppedContainerInspect,
  shouldArchiveReplacedContainer,
} from '../container-log-text';

describe('capContainerLog', () => {
  it('drops blank output', () => {
    expect(capContainerLog('\n  \n')).toBe('');
  });

  it('keeps only the newest lines', () => {
    const raw = Array.from({ length: CONTAINER_LOG_MAX_LINES + 10 }, (_, i) => `line-${i}`).join(
      '\n',
    );
    const capped = capContainerLog(raw);
    expect(capped.split('\n')).toHaveLength(CONTAINER_LOG_MAX_LINES);
    expect(capped.startsWith('line-10\n')).toBe(true);
    expect(capped.endsWith(`line-${CONTAINER_LOG_MAX_LINES + 9}`)).toBe(true);
  });

  it('trims a single oversized line to the byte cap', () => {
    const capped = capContainerLog('x'.repeat(CONTAINER_LOG_MAX_BYTES + 50));
    expect(Buffer.byteLength(capped, 'utf8')).toBe(CONTAINER_LOG_MAX_BYTES);
  });

  it('trims multi-byte text without splitting a character', () => {
    const capped = capContainerLog('€'.repeat(CONTAINER_LOG_MAX_BYTES));
    const bytes = Buffer.byteLength(capped, 'utf8');
    expect(bytes).toBeLessThanOrEqual(CONTAINER_LOG_MAX_BYTES);
    expect(bytes).toBeGreaterThan(CONTAINER_LOG_MAX_BYTES - 3);
    expect(capped.endsWith('€')).toBe(true);
  });
});

describe('shouldArchiveReplacedContainer', () => {
  it('skips preview deploys so they do not replace production archives', () => {
    expect(shouldArchiveReplacedContainer({ useRolling: false, isPreview: true })).toBe(false);
  });

  it('archives a normal recreate and leaves rolling swaps until the old container is removed', () => {
    expect(shouldArchiveReplacedContainer({ useRolling: false, isPreview: false })).toBe(true);
    expect(shouldArchiveReplacedContainer({ useRolling: true, isPreview: false })).toBe(false);
  });
});

describe('parseStoppedContainerInspect', () => {
  it('reads container name and service id', () => {
    expect(parseStoppedContainerInspect('/api-abc|svc_1\n\n/db-def|svc_2\n')).toEqual([
      { containerName: 'api-abc', serviceId: 'svc_1' },
      { containerName: 'db-def', serviceId: 'svc_2' },
    ]);
  });
});

describe('combineServiceLogs', () => {
  it('returns only the live tail when nothing has been archived', () => {
    expect(combineServiceLogs([], ['now'])).toBe('now');
  });

  it('puts older archives above the current container', () => {
    const text = combineServiceLogs(
      [
        {
          containerName: 'api-new',
          reason: 'deploy',
          capturedAt: '2026-10-07T09:00:00.000Z',
          content: 'newer-archive',
        },
        {
          containerName: 'api-old',
          reason: 'rolling',
          capturedAt: '2026-10-06T09:00:00.000Z',
          content: 'older-archive',
        },
      ],
      ['live'],
    );
    expect(text.indexOf('older-archive')).toBeLessThan(text.indexOf('newer-archive'));
    expect(text.indexOf('newer-archive')).toBeLessThan(text.indexOf('----- current container -----'));
    expect(text).toContain('rolling update');
    expect(text.endsWith('live')).toBe(true);
  });

  const archive = (name: string, lines: number) => ({
    containerName: name,
    reason: 'deploy' as const,
    capturedAt: '2026-10-07T09:00:00.000Z',
    content: Array.from({ length: lines }, (_, i) => `${name}-${i}`).join('\n'),
  });
  const logLines = (text: string) => text.split('\n').filter((l) => !l.startsWith('-----'));

  it('drops archives when the live container already fills maxLines', () => {
    const live = Array.from({ length: 150 }, (_, i) => `live-${i}`);
    const text = combineServiceLogs([archive('old', 500)], live, 100);
    expect(logLines(text)).toHaveLength(100);
    expect(text).not.toContain('previous container');
    expect(text.startsWith('live-50\n')).toBe(true);
  });

  it('fills the rest of maxLines from the newest archives', () => {
    const live = Array.from({ length: 30 }, (_, i) => `live-${i}`);
    const text = combineServiceLogs([archive('newer', 50), archive('older', 500)], live, 100);
    const lines = logLines(text);
    expect(lines).toHaveLength(100);
    expect(lines[0]).toBe('older-480');
    expect(text.indexOf('older-499')).toBeLessThan(text.indexOf('newer-0'));
    expect(text.endsWith('live-29')).toBe(true);
  });

  it('keeps everything when maxLines is omitted', () => {
    const text = combineServiceLogs([archive('old', 500)], ['live'], undefined);
    expect(logLines(text)).toHaveLength(501);
  });
});
