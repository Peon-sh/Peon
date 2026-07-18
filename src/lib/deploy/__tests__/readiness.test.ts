import { describe, expect, it, vi } from 'vitest';
import {
  interpretReadiness,
  normalizeReadinessWaitOptions,
  parseContainerInspectLine,
  waitForContainerReadiness,
} from '../readiness';

describe('parseContainerInspectLine', () => {
  it('parses status|health|exit', () => {
    expect(parseContainerInspectLine('running|healthy|0')).toEqual({
      status: 'running',
      health: 'healthy',
      exitCode: 0,
    });
  });

  it('treats none as no healthcheck', () => {
    expect(parseContainerInspectLine('running|none|0').health).toBeNull();
  });
});

describe('interpretReadiness', () => {
  it('fails on restarting/exited', () => {
    expect(
      interpretReadiness({ status: 'restarting', health: null, exitCode: 1 }, { mode: 'running' }),
    ).toBe('failed');
    expect(
      interpretReadiness({ status: 'exited', health: null, exitCode: 1 }, { mode: 'healthcheck' }),
    ).toBe('failed');
  });

  it('running mode treats running as ready', () => {
    expect(
      interpretReadiness({ status: 'running', health: null, exitCode: 0 }, { mode: 'running' }),
    ).toBe('ready');
  });

  it('healthcheck mode requires healthy and stays pending without health yet', () => {
    expect(
      interpretReadiness({ status: 'running', health: null, exitCode: 0 }, { mode: 'healthcheck' }),
    ).toBe('pending');
    expect(
      interpretReadiness({ status: 'running', health: 'starting', exitCode: 0 }, { mode: 'healthcheck' }),
    ).toBe('pending');
    expect(
      interpretReadiness({ status: 'running', health: 'healthy', exitCode: 0 }, { mode: 'healthcheck' }),
    ).toBe('ready');
    expect(
      interpretReadiness({ status: 'running', health: 'unhealthy', exitCode: 0 }, { mode: 'healthcheck' }),
    ).toBe('failed');
  });

  it('docker-health-if-present honors health only when present', () => {
    expect(
      interpretReadiness(
        { status: 'running', health: null, exitCode: 0 },
        { mode: 'docker-health-if-present' },
      ),
    ).toBe('ready');
    expect(
      interpretReadiness(
        { status: 'running', health: 'unhealthy', exitCode: 0 },
        { mode: 'docker-health-if-present' },
      ),
    ).toBe('failed');
  });
});

describe('waitForContainerReadiness', () => {
  it('returns once healthy after start period', async () => {
    const inspect = vi
      .fn()
      .mockResolvedValueOnce('running|starting|0')
      .mockResolvedValueOnce('running|healthy|0');
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await waitForContainerReadiness(
      normalizeReadinessWaitOptions({
        mode: 'healthcheck',
        startPeriodSeconds: 1,
        intervalSeconds: 1,
        retries: 5,
      }),
      { inspect, sleep, log },
    );

    expect(sleep).toHaveBeenCalledWith(1000);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('New container is healthy'));
  });

  it('throws when container becomes unhealthy', async () => {
    const inspect = vi.fn().mockResolvedValue('running|unhealthy|0');
    await expect(
      waitForContainerReadiness(
        normalizeReadinessWaitOptions({
          mode: 'healthcheck',
          startPeriodSeconds: 0,
          intervalSeconds: 1,
          retries: 3,
        }),
        { inspect, sleep: async () => {}, log: () => {} },
      ),
    ).rejects.toThrow(/unhealthy/i);
  });

  it('throws on crash-loop in running mode', async () => {
    const inspect = vi.fn().mockResolvedValue('restarting|none|1');
    await expect(
      waitForContainerReadiness(
        normalizeReadinessWaitOptions({
          mode: 'running',
          startPeriodSeconds: 0,
          intervalSeconds: 1,
          retries: 3,
        }),
        { inspect, sleep: async () => {}, log: () => {} },
      ),
    ).rejects.toThrow(/not running/i);
  });
});
