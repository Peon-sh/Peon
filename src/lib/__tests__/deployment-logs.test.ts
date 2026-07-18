import { describe, expect, it } from 'vitest';
import { buildLogsDownloadFilename, buildLogsDownloadText } from '../deployment-logs';

describe('buildLogsDownloadText', () => {
  it('joins log messages with newlines', () => {
    expect(
      buildLogsDownloadText([
        { ts: 1, stream: 'stdout', message: 'step 1' },
        { ts: 2, stream: 'stderr', message: 'warn' },
        { ts: 3, stream: 'system', message: 'done' },
      ]),
    ).toBe('step 1\nwarn\ndone');
  });

  it('returns empty string for no logs', () => {
    expect(buildLogsDownloadText([])).toBe('');
  });
});

describe('buildLogsDownloadFilename', () => {
  it('uses a short uuid prefix', () => {
    expect(buildLogsDownloadFilename('abcdefghijklmnop')).toBe(
      'deployment-abcdefghijkl-build-logs.txt',
    );
  });
});
