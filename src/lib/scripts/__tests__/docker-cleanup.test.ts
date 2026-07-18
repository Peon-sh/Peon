import { describe, expect, it } from 'vitest';
import {
  cleanupScript,
  parseDiskUsagePercent,
  shouldRunDockerCleanup,
} from '../docker-cleanup';

describe('cleanupScript', () => {
  it('always prunes images, builders, and containers', () => {
    const script = cleanupScript();
    expect(script).toContain('docker image prune -af');
    expect(script).toContain('docker builder prune -af');
    expect(script).toContain('docker container prune -f');
    expect(script).not.toContain('docker volume prune');
    expect(script).not.toContain('docker network prune');
  });

  it('optionally prunes unused volumes and networks', () => {
    const script = cleanupScript({
      deleteUnusedVolumes: true,
      deleteUnusedNetworks: true,
    });
    expect(script).toContain('docker volume prune -af');
    expect(script).toContain('docker network prune -f');
  });

  it('can enable volumes without networks', () => {
    const script = cleanupScript({ deleteUnusedVolumes: true });
    expect(script).toContain('docker volume prune -af');
    expect(script).not.toContain('docker network prune');
  });
});

describe('parseDiskUsagePercent', () => {
  it('parses digit-only output', () => {
    expect(parseDiskUsagePercent('72')).toBe(72);
  });

  it('strips non-digits', () => {
    expect(parseDiskUsagePercent('Use%\n72\n')).toBe(72);
  });

  it('returns null for empty or invalid values', () => {
    expect(parseDiskUsagePercent('')).toBeNull();
    expect(parseDiskUsagePercent('abc')).toBeNull();
    expect(parseDiskUsagePercent('101')).toBeNull();
  });
});

describe('shouldRunDockerCleanup', () => {
  it('always runs for manual cleanup', () => {
    expect(
      shouldRunDockerCleanup({
        manual: true,
        forceDockerCleanup: false,
        diskUsagePercent: 10,
        threshold: 80,
      }).run,
    ).toBe(true);
  });

  it('always runs when force docker cleanup is enabled', () => {
    expect(
      shouldRunDockerCleanup({
        manual: false,
        forceDockerCleanup: true,
        diskUsagePercent: 10,
        threshold: 80,
      }).run,
    ).toBe(true);
  });

  it('runs when disk usage meets threshold', () => {
    expect(
      shouldRunDockerCleanup({
        manual: false,
        forceDockerCleanup: false,
        diskUsagePercent: 85,
        threshold: 80,
      }).run,
    ).toBe(true);
  });

  it('skips when disk usage is below threshold', () => {
    expect(
      shouldRunDockerCleanup({
        manual: false,
        forceDockerCleanup: false,
        diskUsagePercent: 50,
        threshold: 80,
      }).run,
    ).toBe(false);
  });

  it('runs when disk usage is unavailable (null or 0)', () => {
    expect(
      shouldRunDockerCleanup({
        manual: false,
        forceDockerCleanup: false,
        diskUsagePercent: null,
        threshold: 80,
      }).run,
    ).toBe(true);
    expect(
      shouldRunDockerCleanup({
        manual: false,
        forceDockerCleanup: false,
        diskUsagePercent: 0,
        threshold: 80,
      }).run,
    ).toBe(true);
  });
});
