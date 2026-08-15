import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIntervalHeartbeat } from '../visibility-heartbeat';

describe('startIntervalHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on the interval and stops after stop()', async () => {
    vi.useFakeTimers();
    const tick = vi.fn().mockResolvedValue(undefined);
    const hb = startIntervalHeartbeat(tick, 1000);

    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(tick).toHaveBeenCalledTimes(3);

    hb.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('logs tick failures without throwing', async () => {
    vi.useFakeTimers();
    const tick = vi.fn().mockRejectedValue(new Error('ReceiptHandle is invalid'));
    const log = vi.fn();
    const hb = startIntervalHeartbeat(tick, 1000, { log });

    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toHaveBeenCalledWith('heartbeat failed: ReceiptHandle is invalid');
    hb.stop();
  });

  it('stops after the first error when stopOnError is set', async () => {
    vi.useFakeTimers();
    const tick = vi.fn().mockRejectedValue(new Error('lease lost'));
    const hb = startIntervalHeartbeat(tick, 1000, { stopOnError: true });

    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(1);
    hb.stop();
  });
});
