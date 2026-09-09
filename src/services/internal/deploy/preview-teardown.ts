import { sshPool, type SshTarget } from '@/lib/ssh';
import { shellSingleQuote } from '@/lib/shell/quote';
import {
  legacyPreviewComposeProject,
  previewComposeProject,
  PEON_SERVICE_ID_LABEL,
} from '@/lib/deploy/rolling';

const RM_EACH = 'while read -r c; do docker rm -f "$c" >/dev/null 2>&1 || true; done';

/**
 * Shell that force-removes containers this service left in the shared
 * `pr-<n>` project, from before preview projects were scoped per service.
 *
 * Needed on the way up as well as down: preview container names are stable
 * across deploys, so a leftover in the old project would collide with the
 * container the new project wants to create and fail the deploy.
 *
 * Two passes, because neither identifier covers every service: Peon's own
 * ownership label is absent from raw-compose stacks, and compose's working-dir
 * label is only present on stacks compose created. Both are ANDed with the old
 * project name, so neither pass can reach another service's preview.
 */
export function legacyPreviewSweep(opts: {
  serviceId: string;
  pullRequestId: number;
  dir: string;
}): string {
  const legacy = shellSingleQuote(
    `com.docker.compose.project=${legacyPreviewComposeProject(opts.pullRequestId)}`,
  );
  const owner = shellSingleQuote(`${PEON_SERVICE_ID_LABEL}=${opts.serviceId}`);
  const workingDir = shellSingleQuote(`com.docker.compose.project.working_dir=${opts.dir}`);

  return (
    `docker ps -aq --filter label=${legacy} --filter label=${owner} 2>/dev/null | ${RM_EACH}; ` +
    `docker ps -aq --filter label=${legacy} --filter label=${workingDir} 2>/dev/null | ${RM_EACH}`
  );
}

/**
 * Stop and remove one service's preview stack for a PR.
 *
 * Previews run under a per-service compose project, so `down` has to name it —
 * the directory's default project is shared with every other service previewing
 * the same PR number, and `--remove-orphans` there would take their containers
 * with it. Anything still in that shared project is cleaned up by the scoped
 * sweep instead.
 *
 * Best-effort throughout: a preview container left behind is better than a
 * failed teardown keeping the DB row alive.
 */
export async function tearDownPreviewStack(
  target: SshTarget,
  opts: { serviceId: string; serviceUuid: string; pullRequestId: number; dir: string },
): Promise<void> {
  const dir = shellSingleQuote(opts.dir);
  const project = shellSingleQuote(previewComposeProject(opts.serviceUuid, opts.pullRequestId));

  await sshPool.exec(
    target,
    `if [ -f ${dir}/docker-compose.yml ]; then ` +
      `(cd ${dir} && docker compose -p ${project} down --remove-orphans) || true; fi; ` +
      legacyPreviewSweep(opts),
  );
}
