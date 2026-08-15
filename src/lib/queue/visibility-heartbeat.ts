export type IntervalHeartbeatOptions = {
  log?: (message: string) => void;
  /** When true, the first rejected tick clears the interval (lost lease, invalid receipt). */
  stopOnError?: boolean;
};

/**
 * Periodic callback used to extend SQS visibility (or any similar lease)
 * while a long-running job is in flight.
 */
export function startIntervalHeartbeat(
  tick: () => Promise<void>,
  intervalMs: number,
  options: IntervalHeartbeatOptions = {},
): { stop: () => void } {
  let stopped = false;
  const stop = () => {
    stopped = true;
    clearInterval(id);
  };
  const id = setInterval(() => {
    if (stopped) return;
    void tick().catch((err) => {
      options.log?.(`heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
      if (options.stopOnError) stop();
    });
  }, intervalMs);
  return { stop };
}
