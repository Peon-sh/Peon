/**
 * Post-deploy readiness: wait for Docker health (or a stable
 * running state when no healthcheck is configured) before marking success.
 */

export type ContainerRuntimeState = {
  /** Docker State.Status: running | restarting | exited | … */
  status: string;
  /** Docker State.Health.Status, or null when the container has no healthcheck. */
  health: string | null;
  exitCode: number;
};

export type ReadinessVerdict = 'ready' | 'pending' | 'failed';

export type ReadinessWaitOptions = {
  mode: ReadinessMode;
  startPeriodSeconds: number;
  intervalSeconds: number;
  retries: number;
};

export function parseContainerInspectLine(line: string): ContainerRuntimeState {
  const [status = '', healthRaw = 'none', exitRaw = '0'] = line.trim().replace(/^"|"$/g, '').split('|');
  const health =
    !healthRaw || healthRaw === 'none' || healthRaw === '<no value>' || healthRaw === '<nil>'
      ? null
      : healthRaw;
  const exitCode = Number.parseInt(exitRaw, 10);
  return {
    status: status || 'unknown',
    health,
    exitCode: Number.isFinite(exitCode) ? exitCode : 0,
  };
}

export type ReadinessMode = 'healthcheck' | 'running' | 'docker-health-if-present';

/**
 * Decide whether the container is ready, still starting, or definitively failed.
 * Health poll: healthy → success, unhealthy → fail,
 * starting → keep waiting; with no healthcheck, a stable `running` state wins
 * and restarting/exited fails (crash loop).
 */
export function interpretReadiness(
  state: ContainerRuntimeState,
  opts: { mode: ReadinessMode },
): ReadinessVerdict {
  const status = state.status.toLowerCase();

  if (status === 'restarting' || status === 'exited' || status === 'dead' || status === 'removing') {
    return 'failed';
  }
  if (status !== 'running') {
    return 'pending';
  }

  if (opts.mode === 'running') {
    return 'ready';
  }

  const health = state.health?.toLowerCase() ?? null;

  if (opts.mode === 'docker-health-if-present') {
    if (health == null) return 'ready';
    if (health === 'healthy') return 'ready';
    if (health === 'unhealthy') return 'failed';
    return 'pending';
  }

  // mode === 'healthcheck' — Peon-configured healthcheck must report healthy.
  if (health == null) return 'pending';
  if (health === 'healthy') return 'ready';
  if (health === 'unhealthy') return 'failed';
  return 'pending';
}

export function normalizeReadinessWaitOptions(input: {
  mode: ReadinessMode;
  startPeriodSeconds?: number | null;
  intervalSeconds?: number | null;
  retries?: number | null;
}): ReadinessWaitOptions {
  const usesHealth = input.mode !== 'running';
  return {
    mode: input.mode,
    startPeriodSeconds: Math.max(0, input.startPeriodSeconds ?? (usesHealth ? 5 : 3)),
    intervalSeconds: Math.max(1, input.intervalSeconds ?? (usesHealth ? 5 : 2)),
    retries: Math.max(1, input.retries ?? (usesHealth ? 10 : 15)),
  };
}

/** Format string used with `docker inspect --format=…`. */
export const CONTAINER_INSPECT_FORMAT =
  "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.ExitCode}}";

export type WaitForReadinessDeps = {
  inspect: () => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
  isCancelled?: () => Promise<boolean>;
};

/**
 * Poll container state until ready, failed, or retries exhausted.
 */
export async function waitForContainerReadiness(
  opts: ReadinessWaitOptions,
  deps: WaitForReadinessDeps,
): Promise<ContainerRuntimeState> {
  const { mode, startPeriodSeconds, intervalSeconds, retries } = opts;

  if (startPeriodSeconds > 0) {
    deps.log(
      mode === 'healthcheck'
        ? `Waiting for the start period (${startPeriodSeconds}s) before starting healthcheck.`
        : `Waiting ${startPeriodSeconds}s for the container to settle…`,
    );
    await deps.sleep(startPeriodSeconds * 1000);
  }

  let last: ContainerRuntimeState = { status: 'unknown', health: null, exitCode: 0 };

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (deps.isCancelled && (await deps.isCancelled())) {
      throw new Error('Deployment cancelled');
    }

    const raw = await deps.inspect();
    last = parseContainerInspectLine(raw);
    const verdict = interpretReadiness(last, { mode });

    const healthLabel = last.health ?? 'none';
    deps.log(
      `Attempt ${attempt} of ${retries} | status=${last.status} health=${healthLabel}`,
    );

    if (verdict === 'ready') {
      deps.log(mode === 'healthcheck' ? 'New container is healthy.' : 'Container is ready.');
      return last;
    }
    if (verdict === 'failed') {
      throw new Error(
        mode === 'healthcheck'
          ? `New container is unhealthy (status=${last.status}, health=${healthLabel}, exit=${last.exitCode}).`
          : `Container is not running (status=${last.status}, exit=${last.exitCode}).`,
      );
    }

    if (attempt < retries) {
      await deps.sleep(intervalSeconds * 1000);
    }
  }

  throw new Error(
    mode === 'healthcheck'
      ? `Healthcheck did not become healthy after ${retries} attempts (last status=${last.status}, health=${last.health ?? 'none'}).`
      : `Container did not become ready after ${retries} attempts (last status=${last.status}).`,
  );
}
