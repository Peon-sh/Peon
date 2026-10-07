import { describe, expect, it } from 'vitest';
import {
  capContainerLog,
  combineServiceLogs,
  CONTAINER_LOG_MAX_BYTES,
  CONTAINER_LOG_MAX_LINES,
  parseStoppedContainerInspect,
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
    expect(new TextEncoder().encode(capped).length).toBe(CONTAINER_LOG_MAX_BYTES);
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
});
