import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { sshPool, sshTargetForServer, type SshTarget } from '@/lib/ssh';
import { decrypt } from '@/lib/crypto/encryption';
import {
  buildCompose,
  detectComposeServicePort,
  parseCompose,
  pickPrimaryComposeService,
  prepareRawCompose,
  type ComposeServiceSpec,
} from '@/lib/docker/compose';
import { containerName, DEFAULT_NETWORK, proxyRouterName } from '@/lib/docker/naming';
import {
  buildImageCleanupScript,
  buildImageRmiScript,
  parseDockerImageList,
  selectImagesToDelete,
} from '@/lib/docker/image-cleanup';
import { mergeDockerRunIntoService } from '@/lib/docker/run-options';
import { dockerExecShellCommand, shellSingleQuote } from '@/lib/shell/quote';
import { stringify, parse as parseYaml } from 'yaml';
import { engineSpec, resolveDatabaseDataPath } from '@/lib/docker/databases';
import {
  buildPackCliEnvArgs,
  buildPackDockerBuildArgs,
  buildPackEnvPrefix,
  resolveNodeBuildVersion,
} from '@/lib/deploy/build-pack-env';
import { resolveDockerfileBuildPath } from '@/lib/deploy/paths';
import {
  CONTAINER_INSPECT_FORMAT,
  normalizeReadinessWaitOptions,
  waitForContainerReadiness,
} from '@/lib/deploy/readiness';
import { resolveComposeStartCommand } from '@/lib/deploy/start-command';
import { buildGitSyncScript } from '@/lib/deploy/sync-repo-script';
import { assertSafeGitRefName } from '@/lib/git/ref';
import { authenticatedGithubCloneUrl, resolveGithubAuth } from '@/lib/github/app';
import { makeDeploymentLogger } from '@/services/internal/deploy/logs';
import { captureDeploymentPreview } from '@/services/internal/deploy/screenshot';
import { notifyService } from '@/services/internal/notifications/events';
import { buildDeploymentMessage } from '@/services/internal/notifications/deployment-message';
import {
  DeploymentCancelledError,
  statusAfterCancelledDeploy,
  statusAfterFailedDeploy,
} from '@/services/internal/deploy/status';
import { promoteServerAfterSlotFreed } from '@/services/internal/deploy/server-queue';
import {
  releaseDeployLease,
  startDeployLeaseHeartbeat,
  tryAcquireDeployLease,
} from '@/services/internal/deploy/lease';
import { notifyPreviewDeployOutcome } from '@/services/internal/deploy/preview';
import {
  buildEnvMap,
  buildHealthcheck,
  envFileContent,
  proxyLabelsFor,
  serviceDir,
  volumesFor,
  type FullService,
} from '@/services/internal/deploy/helpers';
import {
  PEON_DEPLOYMENT_ID_LABEL,
  PEON_ROLE_LABEL,
  PEON_SERVICE_ID_LABEL,
  rollingComposeProject,
  rollingContainerName,
  shouldUseRollingUpdate,
} from '@/lib/deploy/rolling';
import { ServiceRuntime } from '@/services/internal/service/runtime';

/** Clone or update a git repository on the server. */
async function syncRepo(
  target: SshTarget,
  svc: FullService,
  dir: string,
  log: (m: string) => void,
  opts: { forceClean?: boolean; branch?: string | null; commitSha?: string | null } = {},
) {
  let repo = svc.gitRepository!;
  // Single choke point for every deploy (production and preview): refuse a ref
  // that could be interpreted by the remote shell or by git as an option/refspec.
  const branch = assertSafeGitRefName(opts.branch || svc.gitBranch || 'main');
  const src = `${dir}/src`;

  // For private repos accessed via a deploy key, write the key to the server and
  // point git at it through GIT_SSH_COMMAND for the duration of the clone/pull.
  let gitSshPrefix = '';
  let keyCleanup = 'true';
  if (svc.gitSourceType === 'GITHUB_APP' && svc.githubApp) {
    log('Using GitHub App installation token for repository access.');
    repo = await authenticatedGithubCloneUrl(resolveGithubAuth(svc.githubApp), repo);
  } else if (svc.gitSourceType === 'DEPLOY_KEY' && svc.privateKey) {
    const keyPath = `${dir}/.deploy_key`;
    let keyContent = svc.privateKey.privateKey;
    try {
      keyContent = decrypt(svc.privateKey.privateKey);
    } catch {
      // stored in plaintext (should not happen); use as-is
    }
    await sshPool.exec(target, `mkdir -p ${dir}`);
    await sshPool.putContent(target, keyPath, keyContent.endsWith('\n') ? keyContent : keyContent + '\n');
    await sshPool.exec(target, `chmod 600 ${keyPath}`);
    gitSshPrefix = `GIT_SSH_COMMAND='ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null' `;
    keyCleanup = `rm -f ${keyPath}`;
  }

  if (opts.commitSha?.trim()) {
    log(`Rolling back / pinning to commit ${opts.commitSha.trim().slice(0, 12)}…`);
  }

  const script = buildGitSyncScript({
    src,
    repo,
    branch,
    gitSshPrefix,
    keyCleanup,
    forceClean: opts.forceClean,
    commitSha: opts.commitSha,
  });
  const res = await sshPool.execStream(target, script, (c) => log(c.trimEnd()));
  if (res.code !== 0) throw new Error('Git clone/pull failed.');
  return res.stdout.trim().split('\n').pop() ?? '';
}

/** Build a docker image on the server according to the service's build pack. */
async function buildImage(
  target: SshTarget,
  svc: FullService,
  dir: string,
  imageTag: string,
  log: (m: string) => void,
  env: Record<string, string> = {},
  opts: { noCache?: boolean } = {},
): Promise<void> {
  const src = `${dir}/src`;
  const base = svc.baseDirectory && svc.baseDirectory !== '/' ? `${src}${svc.baseDirectory}` : src;
  const packEnv = buildPackEnvPrefix(svc, env);
  const packEnvArgs = buildPackCliEnvArgs(svc, env);
  const dockerBuildArgs = buildPackDockerBuildArgs(svc, env);
  const noCache = opts.noCache ? '--no-cache' : '';
  // Nixpacks picks its nixpkgs archive from .nvmrc/engines — process env alone
  // often still plans nodejs_18. Seed .nvmrc when the repo has neither pin.
  const nodeMajor = resolveNodeBuildVersion(env);
  const ensureNvmrc = `if [ ! -f .nvmrc ] && [ ! -f .node-version ]; then echo ${nodeMajor} > .nvmrc; fi`;

  let buildScript: string;
  switch (svc.buildPack) {
    case 'DOCKERFILE':
      if (svc.dockerfileContent) {
        await sshPool.putContent(target, `${base}/Dockerfile.peon`, svc.dockerfileContent);
        buildScript = `cd ${base} && ${packEnv} docker build ${noCache} ${dockerBuildArgs} -t ${imageTag} -f Dockerfile.peon .`;
      } else {
        // Workdir + dockerfile location (e.g. /docker/Dockerfile.worker).
        const dockerfileFile = resolveDockerfileBuildPath(base, svc.dockerfilePath);
        buildScript = `cd ${base} && ${packEnv} docker build ${noCache} ${dockerBuildArgs} -t ${imageTag} -f ${dockerfileFile} .`;
      }
      break;
    case 'NIXPACKS':
      buildScript = `cd ${base} && ${ensureNvmrc} && (command -v nixpacks >/dev/null 2>&1 || curl -sSL https://nixpacks.com/install.sh | bash) && ${packEnv} nixpacks build . --name ${imageTag} ${noCache} ${packEnvArgs}`;
      break;
    case 'RAILPACK':
      // Railpack builds via its own CLI; fall back to nixpacks if railpack is unavailable.
      buildScript = `cd ${base} && ${ensureNvmrc} && if command -v railpack >/dev/null 2>&1; then ${packEnv} railpack build --name ${imageTag} ${packEnvArgs} .; else (command -v nixpacks >/dev/null 2>&1 || curl -sSL https://nixpacks.com/install.sh | bash) && ${packEnv} nixpacks build . --name ${imageTag} ${noCache} ${packEnvArgs}; fi`;
      break;
    case 'STATIC': {
      const nginxfile = `FROM nginx:alpine\nCOPY . /usr/share/nginx/html\n`;
      await sshPool.putContent(target, `${base}/Dockerfile.peon-static`, nginxfile);
      buildScript = `cd ${base} && docker build ${noCache} -t ${imageTag} -f Dockerfile.peon-static .`;
      break;
    }
    default:
      if (svc.dockerfileContent) {
        await sshPool.putContent(target, `${base}/Dockerfile.peon`, svc.dockerfileContent);
        buildScript = `cd ${base} && ${packEnv} docker build ${noCache} ${dockerBuildArgs} -t ${imageTag} -f Dockerfile.peon .`;
      } else {
        const dockerfileFile = resolveDockerfileBuildPath(base, svc.dockerfilePath);
        buildScript = `cd ${base} && ${packEnv} docker build ${noCache} ${dockerBuildArgs} -t ${imageTag} -f ${dockerfileFile} .`;
      }
  }

  if (opts.noCache) log('Building without cache (--no-cache)…');
  log(`Building image ${imageTag}…`);
  const res = await sshPool.execStream(target, buildScript, (c) => log(c.trimEnd()));
  if (res.code !== 0) throw new Error('Image build failed.');
}

async function composeUp(
  target: SshTarget,
  dir: string,
  compose: string,
  log: (m: string) => void,
  env?: Record<string, string>,
  opts?: { projectName?: string; removeOrphans?: boolean },
) {
  await sshPool.exec(target, `mkdir -p ${dir}`);
  await sshPool.putContent(target, `${dir}/docker-compose.yml`, compose);
  if (env && Object.keys(env).length > 0) {
    // Written beside the compose file so `${VAR}` interpolation (incl. the
    // template magic vars) resolves during `docker compose up`.
    await sshPool.putContent(target, `${dir}/.env`, envFileContent(env));
  }
  // The compose file references the shared proxy network as external; make
  // sure it exists (older servers were provisioned with a different default).
  await sshPool.exec(
    target,
    `docker network inspect ${DEFAULT_NETWORK} >/dev/null 2>&1 || docker network create --attachable ${DEFAULT_NETWORK}`,
  );
  const project = opts?.projectName ? `-p ${shellSingleQuote(opts.projectName)} ` : '';
  const orphans = opts?.removeOrphans === false ? '' : ' --remove-orphans';
  const res = await sshPool.execStream(
    target,
    `cd ${dir} && docker compose ${project}up -d${orphans}`,
    (c) => log(c.trimEnd()),
  );
  if (res.code !== 0) throw new Error('docker compose up failed.');
}

/** Stop/remove other containers for this Peon service, keeping `keepContainer`. */
async function stopPreviousServiceContainers(
  target: SshTarget,
  serviceId: string,
  keepContainer: string,
  log: (m: string) => void,
): Promise<void> {
  const list = await sshPool.exec(
    target,
    `docker ps -aq --filter label=${PEON_SERVICE_ID_LABEL}=${shellSingleQuote(serviceId)} --filter label=${PEON_ROLE_LABEL}=app 2>/dev/null`,
  );
  const ids = list.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!ids.length) {
    // Fallback: stop known previous name if label filter finds nothing (pre-label deploys).
    return;
  }
  for (const id of ids) {
    const nameRes = await sshPool.exec(
      target,
      `docker inspect --format='{{.Name}}' ${shellSingleQuote(id)} 2>/dev/null`,
    );
    const name = nameRes.stdout.trim().replace(/^\//, '');
    if (!name || name === keepContainer) continue;
    log(`Stopping previous container ${name}…`);
    await sshPool.exec(
      target,
      `docker stop ${shellSingleQuote(name)} >/dev/null 2>&1 || true; docker rm -f ${shellSingleQuote(name)} >/dev/null 2>&1 || true`,
    );
  }
}

async function removeFailedRollingContainer(
  target: SshTarget,
  container: string,
  log: (m: string) => void,
): Promise<void> {
  log(`Rolling update failed — removing new container ${container}, keeping the previous one.`);
  await sshPool.exec(
    target,
    `docker stop ${shellSingleQuote(container)} >/dev/null 2>&1 || true; docker rm -f ${shellSingleQuote(container)} >/dev/null 2>&1 || true`,
  );
}

/** Resolve the actual container name for a compose service after `compose up`. */
async function resolveComposeRuntimeContainer(
  target: SshTarget,
  dir: string,
  serviceKey: string,
): Promise<string | null> {
  const idRes = await sshPool.exec(
    target,
    `cd ${shellSingleQuote(dir)} && docker compose ps -q ${shellSingleQuote(serviceKey)} 2>/dev/null | head -1`,
  );
  const id = idRes.stdout.trim();
  if (!id) return null;
  const nameRes = await sshPool.exec(
    target,
    `docker inspect --format='{{.Name}}' ${shellSingleQuote(id)} 2>/dev/null`,
  );
  const name = nameRes.stdout.trim().replace(/^\//, '');
  return name || null;
}

/** Remove old peon/* tags past dockerImagesToKeep (always keeps currentTag). */
async function cleanupRetainedImages(
  target: SshTarget,
  imageRepository: string,
  currentTag: string,
  imagesToKeep: number,
  log: (m: string) => void,
): Promise<void> {
  try {
    const listRes = await sshPool.exec(target, buildImageCleanupScript(imageRepository));
    const images = parseDockerImageList(listRes.stdout);
    const toDelete = selectImagesToDelete(images, currentTag, imagesToKeep);
    if (toDelete.length === 0) return;
    log(
      `Cleaning old images for ${imageRepository} (keep ${imagesToKeep} + current): removing ${toDelete.length}…`,
    );
    await sshPool.exec(target, buildImageRmiScript(toDelete.map((img) => img.imageRef)));
  } catch (err) {
    log(
      `Image cleanup skipped: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

/**
 * Wait until the container is healthy (or stably running when no Docker
 * healthcheck is present) before marking the deployment finished.
 */
async function waitUntilReady(
  target: SshTarget,
  container: string,
  svc: FullService,
  deploymentId: string,
  log: (m: string) => void,
): Promise<void> {
  // APPLICATION/DATABASE: Peon healthcheck on → require Docker healthy.
  // Healthcheck off → require running (catches crash-loops).
  // COMPOSE: honor Docker health when the compose file defines one.
  const mode =
    svc.kind === 'COMPOSE'
      ? 'docker-health-if-present'
      : svc.healthCheckEnabled
        ? 'healthcheck'
        : 'running';
  const opts = normalizeReadinessWaitOptions({
    mode,
    startPeriodSeconds: svc.healthCheckStartPeriod,
    intervalSeconds: svc.healthCheckInterval,
    retries: svc.healthCheckRetries,
  });

  log(
    mode === 'healthcheck'
      ? 'Waiting for healthcheck to pass on the new container.'
      : 'Waiting for the new container to become ready…',
  );

  try {
    await waitForContainerReadiness(opts, {
      inspect: async () => {
        const res = await sshPool.exec(
          target,
          `docker inspect --format='${CONTAINER_INSPECT_FORMAT}' ${shellSingleQuote(container)}`,
        );
        if (res.code !== 0) {
          throw new Error(`Container "${container}" not found after start.`);
        }
        return res.stdout.trim() || res.stderr.trim();
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log,
      isCancelled: async () => {
        const row = await prisma.deployment.findUnique({
          where: { id: deploymentId },
          select: { status: true },
        });
        return row?.status === 'CANCELLED';
      },
    });
  } catch (err) {
    // Surface recent logs before failing the deploy.
    log('----------------------------------------');
    log('Container logs:');
    await sshPool
      .execStream(target, `docker logs -n 100 ${shellSingleQuote(container)} 2>&1 || true`, (c) =>
        log(c.trimEnd()),
      )
      .catch(() => undefined);
    log('----------------------------------------');
    if (err instanceof Error && err.message === 'Deployment cancelled') {
      throw new DeploymentCancelledError();
    }
    throw err;
  }
}

async function assertNotCancelled(deploymentId: string): Promise<void> {
  const row = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { status: true },
  });
  if (row?.status === 'CANCELLED') throw new DeploymentCancelledError();
}

async function hasPriorFinishedProduction(
  serviceId: string,
  excludeDeploymentId: string,
): Promise<boolean> {
  const prior = await prisma.deployment.findFirst({
    where: {
      serviceId,
      status: 'FINISHED',
      isPreview: false,
      id: { not: excludeDeploymentId },
    },
    select: { id: true },
  });
  return !!prior;
}

/** Main deployment entrypoint invoked by the worker. */
export async function runDeployment(deploymentId: string): Promise<void> {
  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) throw new NotFoundError('Deployment not found.');

  const svc = (await prisma.service.findUnique({
    where: { id: deployment.serviceId },
    include: {
      settings: true,
      privateKey: true,
      githubApp: { include: { privateKey: true } },
      project: { select: { id: true, name: true } },
    },
  })) as (FullService & { project: { id: string; name: string } }) | null;
  if (!svc) throw new NotFoundError('Service not found.');
  if (!svc.serverId) throw new Error('Service has no target server.');

  const logger = makeDeploymentLogger(deploymentId);
  const log = (m: string) => {
    if (m) void logger.stdout(m);
  };

  // Claim while QUEUED, or continue if already promoted to IN_PROGRESS (server-queue gate).
  if (deployment.status === 'CANCELLED') {
    await logger.info('Deployment was cancelled before start.');
    return;
  }
  if (deployment.status === 'QUEUED') {
    const claimed = await prisma.deployment.updateMany({
      where: { id: deploymentId, status: 'QUEUED' },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    if (claimed.count === 0) {
      const again = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        select: { status: true },
      });
      if (again?.status === 'CANCELLED') {
        await logger.info('Deployment was cancelled before start.');
        return;
      }
      if (again?.status !== 'IN_PROGRESS') {
        await logger.info(`Skipping deployment in status ${again?.status ?? deployment.status}.`);
        return;
      }
    }
  } else if (deployment.status !== 'IN_PROGRESS') {
    await logger.info(`Skipping deployment in status ${deployment.status}.`);
    return;
  }

  // SQS redelivers after VisibilityTimeout unless the worker heartbeats.
  // A second worker must not run the same IN_PROGRESS row in parallel.
  const leaseOwner = randomUUID();
  if (!(await tryAcquireDeployLease(deploymentId, leaseOwner))) {
    await logger.info('Another worker is already running this deployment; skipping duplicate.');
    return;
  }
  const leaseHeartbeat = startDeployLeaseHeartbeat(deploymentId, leaseOwner, (m) => {
    void logger.info(m);
  });

  const isPreview = deployment.isPreview && deployment.pullRequestId != null;
  let preview: Awaited<ReturnType<typeof prisma.servicePreview.findUnique>> = null;

  try {
    if (isPreview) {
      preview = await prisma.servicePreview.findUnique({
        where: {
          serviceId_pullRequestId: {
            serviceId: svc.id,
            pullRequestId: deployment.pullRequestId!,
          },
        },
      });
    }

    if (!isPreview) {
      await prisma.service.update({ where: { id: svc.id }, data: { status: 'STARTING' } });
    } else if (preview) {
      await prisma.servicePreview.update({
        where: { id: preview.id },
        data: { status: 'STARTING' },
      });
    }

    await assertNotCancelled(deploymentId);

    const target = await sshTargetForServer(svc.serverId);
    const server = await prisma.server.findUnique({ where: { id: svc.serverId } });
    const proxyType: 'TRAEFIK' | 'CADDY' = server?.proxyType === 'CADDY' ? 'CADDY' : 'TRAEFIK';
    const dir = serviceDir(svc, isPreview ? deployment.pullRequestId : null);
    const deployFqdn = isPreview ? preview?.fqdn ?? null : svc.fqdn;
    const useRolling =
      !isPreview &&
      shouldUseRollingUpdate({
        kind: svc.kind,
        fqdn: deployFqdn,
        ports: svc.ports,
        rollingUpdate: svc.settings?.rollingUpdate,
        isConsistentContainerNameEnabled: svc.settings?.isConsistentContainerNameEnabled,
      });
    const previousContainer =
      useRolling
        ? svc.activeContainerName?.trim() || containerName(svc.name, svc.uuid)
        : null;
    const name = isPreview
      ? containerName(`${svc.name}-pr-${deployment.pullRequestId}`, preview?.uuid ?? deployment.uuid)
      : useRolling
        ? rollingContainerName(svc.name, deployment.uuid)
        : containerName(svc.name, svc.uuid);
    const rollingProject = useRolling ? rollingComposeProject(svc.uuid, deployment.uuid) : null;
    const buildEnv = await buildEnvMap(svc.id, { isPreview: deployment.isPreview, phase: 'build' });
    const runtimeEnv = await buildEnvMap(svc.id, { isPreview: deployment.isPreview, phase: 'runtime' });
    // Previews get isolated empty volumes — never share production data mounts.
    const volumes = isPreview
      ? []
      : await prisma.persistentVolume.findMany({ where: { serviceId: svc.id } });
    const { volumeStrings, named } = volumesFor(volumes);

    await logger.info(
      isPreview
        ? `Deploying preview PR #${deployment.pullRequestId} of ${svc.name} → ${deployFqdn ?? 'no fqdn'}.`
        : useRolling
          ? `Deploying ${svc.name} (${svc.kind}) with rolling update.`
          : `Deploying ${svc.name} (${svc.kind}) to server.`,
    );

    let composeYaml: string;
    /** Image repo used for post-deploy retention cleanup (built apps only). */
    let builtImageRepository: string | null = null;
    let builtImageTag: string | null = null;
    /** Resolved container for wait/post-deploy (may differ under raw compose). */
    let runtimeContainer = name;
    let composePrimaryKey: string | null = null;

    if (svc.kind === 'COMPOSE') {
      if (!svc.dockerComposeRaw) throw new Error('No compose file configured.');
      const { doc } = parseCompose(svc.dockerComposeRaw);
      const composeDoc = doc as { services?: Record<string, Record<string, unknown>> };
      const composeServices = composeDoc.services ?? {};
      const primaryKey = pickPrimaryComposeService(composeServices, svc.name);
      composePrimaryKey = primaryKey;
      const rawMode = svc.settings?.isRawComposeDeploymentEnabled === true;

      if (rawMode) {
        // Raw mode: deploy compose as-is — no network/labels/container_name injection.
        log(
          'Raw compose deployment enabled — deploying compose file as-is (configure proxy/networks yourself).',
        );
        composeYaml = svc.dockerComposeRaw;
        const declared = composeServices[primaryKey]?.container_name;
        if (typeof declared === 'string' && declared.trim()) {
          runtimeContainer = declared.trim();
        }
      } else {
        // Peon status/logs/readiness expect containerName(service, uuid) — inject
        // container_name + shared proxy network + domain labels.
        const port =
          Number(svc.healthCheckPort) ||
          detectComposeServicePort(primaryKey, composeServices[primaryKey]!, svc.dockerComposeRaw) ||
          3000;
        const labels = proxyLabelsFor(svc, name, port, proxyType, deployFqdn);
        if (svc.settings?.customLabels) {
          for (const line of svc.settings.customLabels.split('\n').map((l) => l.trim()).filter(Boolean)) {
            labels.push(line);
          }
        }
        composeYaml = prepareRawCompose(svc.dockerComposeRaw, {
          serviceName: svc.name,
          serviceUuid: isPreview ? `${svc.uuid}-pr-${deployment.pullRequestId}` : svc.uuid,
          network: DEFAULT_NETWORK,
          proxyLabels: labels,
        }).yaml;
        if (svc.settings?.customDockerRunOptions?.trim()) {
          const doc = parseYaml(composeYaml) as {
            services?: Record<string, Record<string, unknown>>;
          };
          const primary = doc.services?.[primaryKey];
          if (primary) {
            doc.services![primaryKey] = mergeDockerRunIntoService(
              primary,
              DEFAULT_NETWORK,
              svc.settings.customDockerRunOptions,
            );
            composeYaml = stringify(doc, { lineWidth: 0 });
          }
        }
      }
    } else if (svc.kind === 'DATABASE') {
      if (isPreview) throw new Error('Preview deployments are not supported for databases.');
      const engine = svc.databaseEngine ?? 'POSTGRESQL';
      const spec = engineSpec(engine);
      const image = svc.databaseImage || spec.defaultImage;
      const creds = {
        username: svc.dbUsername,
        password: svc.dbPassword ? decrypt(svc.dbPassword) : undefined,
        database: svc.dbName,
        rootPassword: svc.dbRootPassword ? decrypt(svc.dbRootPassword) : undefined,
      };
      const dbVolume = `${name}-data`;
      const service: ComposeServiceSpec = {
        containerName: name,
        image,
        env: { ...spec.env(creds), ...runtimeEnv },
        volumes: [`${dbVolume}:${resolveDatabaseDataPath(engine, image)}`, ...volumeStrings],
        networks: [DEFAULT_NETWORK],
        ports: svc.databasePublic && svc.databasePublicPort ? [`${svc.databasePublicPort}:${spec.internalPort}`] : undefined,
        cpuLimit: svc.settings?.cpuLimit ?? undefined,
        memoryLimit: svc.settings?.memoryLimit ?? undefined,
        customDockerRunOptions: svc.settings?.customDockerRunOptions,
      };
      composeYaml = buildCompose({
        services: { [name]: service },
        namedVolumes: [dbVolume, ...named],
        network: DEFAULT_NETWORK,
      });
    } else {
      // Application-style service.
      let image: string;
      if (svc.kind === 'DOCKER_IMAGE') {
        image = `${svc.dockerRegistryImage}:${svc.dockerRegistryTag || 'latest'}`;
        log(`Using image ${image}`);
      } else {
        image = `peon/${name}:${deployment.uuid.slice(0, 8)}`;
        builtImageRepository = `peon/${name}`;
        builtImageTag = deployment.uuid.slice(0, 8);
        const forceRebuild = deployment.forceRebuild || svc.settings?.disableBuildCache === true;
        if (forceRebuild) {
          await logger.info(
            deployment.forceRebuild
              ? 'Force rebuild: clearing source cache and building without Docker/Nixpacks cache.'
              : 'Build cache disabled in settings — building without cache.',
          );
        }
        if (svc.gitRepository) {
          await assertNotCancelled(deploymentId);
          const sha = await syncRepo(target, svc, dir, log, {
            forceClean: deployment.forceRebuild || isPreview,
            branch: isPreview ? preview?.headBranch : null,
            // Rollback (and any pinned deploy) must check out this SHA, not branch tip.
            commitSha: deployment.commitSha,
          });
          await assertNotCancelled(deploymentId);
          // Only persist commit metadata while still in progress (cancel may have won the race).
          await prisma.deployment.updateMany({
            where: { id: deploymentId, status: 'IN_PROGRESS' },
            data: { commitSha: sha },
          });
        }
        await assertNotCancelled(deploymentId);
        await buildImage(target, svc, dir, image, log, buildEnv, { noCache: forceRebuild });
      }

      await assertNotCancelled(deploymentId);

      const port = Number(svc.healthCheckPort || (svc.ports?.split(',')[0] ?? '3000')) || 3000;
      // Traefik/Caddy router id stays stable across rolling swaps so both containers
      // briefly share the same backend service; container_name is deployment-scoped.
      // Previews must use a distinct router id — sharing production's name overwrites
      // Host()/TLS rules and takes down the live domain (404) while preview runs.
      const proxyName = proxyRouterName({
        isPreview,
        deploymentContainerName: name,
        serviceName: svc.name,
        serviceUuid: svc.uuid,
      });
      const labels = proxyLabelsFor(svc, proxyName, port, proxyType, deployFqdn);
      // Peon ownership labels — used to find previous containers during rolling updates.
      labels.push(`${PEON_SERVICE_ID_LABEL}=${svc.id}`);
      labels.push(`${PEON_DEPLOYMENT_ID_LABEL}=${deployment.id}`);
      labels.push(`${PEON_ROLE_LABEL}=app`);
      // Merge any user-defined custom labels (newline-separated `key=value`).
      if (svc.settings?.customLabels) {
        for (const line of svc.settings.customLabels.split('\n').map((l) => l.trim()).filter(Boolean)) {
          labels.push(line);
        }
      }
      const service: ComposeServiceSpec = {
        containerName: name,
        image,
        env: runtimeEnv,
        labels,
        volumes: volumeStrings.length ? volumeStrings : undefined,
        command: resolveComposeStartCommand(svc.startCommand, svc.dockerfilePath),
        networks: [DEFAULT_NETWORK],
        ports: svc.ports && !deployFqdn ? svc.ports.split(',').map((p) => p.trim()).filter(Boolean) : undefined,
        healthcheck: buildHealthcheck(svc, port),
        cpuLimit: svc.settings?.cpuLimit ?? undefined,
        memoryLimit: svc.settings?.memoryLimit ?? undefined,
        stopGracePeriod: svc.settings?.stopGracePeriod ?? undefined,
        customDockerRunOptions: svc.settings?.customDockerRunOptions,
      };
      composeYaml = buildCompose({
        services: { [name]: service },
        namedVolumes: named,
        network: DEFAULT_NETWORK,
      });
    }

    await assertNotCancelled(deploymentId);

    // Pre-deploy command runs in the currently-running container before swap.
    const preCmd = svc.settings?.preDeployCommand?.trim();
    if (preCmd && !isPreview) {
      const preTarget = previousContainer || runtimeContainer;
      log('Running pre-deploy command…');
      await sshPool
        .execStream(target, `${dockerExecShellCommand(preTarget, preCmd)} || true`, (c) => log(c.trimEnd()))
        .catch(() => log('Pre-deploy command skipped (container not running yet).'));
    }

    await assertNotCancelled(deploymentId);

    log(useRolling ? 'Starting new container (rolling update)…' : 'Starting containers…');
    try {
      await composeUp(target, dir, composeYaml, log, svc.kind === 'COMPOSE' ? runtimeEnv : undefined, {
        projectName: rollingProject ?? undefined,
        removeOrphans: !useRolling,
      });
    } catch (err) {
      if (useRolling) {
        await removeFailedRollingContainer(target, name, log);
      }
      throw err;
    }

    // Raw compose may use project-prefixed names — resolve the actual container.
    if (
      svc.kind === 'COMPOSE' &&
      svc.settings?.isRawComposeDeploymentEnabled &&
      composePrimaryKey
    ) {
      const resolved = await resolveComposeRuntimeContainer(target, dir, composePrimaryKey);
      if (resolved) {
        runtimeContainer = resolved;
        log(`Resolved primary container: ${runtimeContainer}`);
      }
    } else {
      runtimeContainer = name;
    }

    await assertNotCancelled(deploymentId);
    try {
      await waitUntilReady(target, runtimeContainer, svc, deploymentId, log);
    } catch (err) {
      if (useRolling) {
        await removeFailedRollingContainer(target, runtimeContainer, log);
      }
      throw err;
    }

    await assertNotCancelled(deploymentId);

    if (useRolling) {
      if (previousContainer && previousContainer !== runtimeContainer) {
        // Prefer label-based cleanup; also stop the known previous name if still up.
        await stopPreviousServiceContainers(target, svc.id, runtimeContainer, log);
        const still = await sshPool.exec(
          target,
          `docker inspect --format='{{.State.Running}}' ${shellSingleQuote(previousContainer)} 2>/dev/null || true`,
        );
        if (still.stdout.trim() === 'true') {
          log(`Stopping previous container ${previousContainer}…`);
          await sshPool.exec(
            target,
            `docker stop ${shellSingleQuote(previousContainer)} >/dev/null 2>&1 || true; docker rm -f ${shellSingleQuote(previousContainer)} >/dev/null 2>&1 || true`,
          );
        }
      } else {
        await stopPreviousServiceContainers(target, svc.id, runtimeContainer, log);
      }
      await prisma.service.update({
        where: { id: svc.id },
        data: { activeContainerName: runtimeContainer },
      });
      ServiceRuntime.invalidate(svc.id);
      log(`Rolling update complete — active container is ${runtimeContainer}.`);
    } else if (!isPreview && svc.kind !== 'COMPOSE' && svc.kind !== 'DATABASE') {
      // Recreate path: drop any leftover rolling containers from earlier deploys.
      await stopPreviousServiceContainers(target, svc.id, runtimeContainer, log);
      await prisma.service.update({
        where: { id: svc.id },
        data: { activeContainerName: runtimeContainer },
      });
      ServiceRuntime.invalidate(svc.id);
    }

    // Post-deploy command runs inside the freshly-started container.
    const postCmd = svc.settings?.postDeployCommand?.trim();
    if (postCmd) {
      log('Running post-deploy command…');
      const res = await sshPool.execStream(
        target,
        dockerExecShellCommand(runtimeContainer, postCmd),
        (c) => log(c.trimEnd()),
      );
      if (res.code !== 0) throw new Error('Post-deploy command failed.');
    }

    await assertNotCancelled(deploymentId);

    if (!isPreview && builtImageRepository && builtImageTag) {
      await cleanupRetainedImages(
        target,
        builtImageRepository,
        builtImageTag,
        svc.settings?.dockerImagesToKeep ?? 3,
        log,
      );
    }

    const finished = await prisma.deployment.updateMany({
      where: { id: deploymentId, status: 'IN_PROGRESS' },
      data: { status: 'FINISHED', finishedAt: new Date() },
    });
    if (finished.count === 0) {
      const row = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        select: { status: true },
      });
      if (row?.status === 'CANCELLED') throw new DeploymentCancelledError();
      await logger.info(
        `Not marking finished; deployment is already ${row?.status ?? 'missing'}.`,
      );
      return;
    }

    if (isPreview && deployment.pullRequestId != null) {
      try {
        await notifyPreviewDeployOutcome({
          serviceId: svc.id,
          pullRequestId: deployment.pullRequestId,
          phase: 'ready',
          fqdn: deployFqdn,
          commitSha: deployment.commitSha,
        });
      } catch (err) {
        // Deploy already FINISHED — never flip to FAILED for GitHub/preview notify issues.
        await logger.info(
          `Preview notify after success failed (deploy still finished): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else {
      await prisma.service.update({ where: { id: svc.id }, data: { status: 'RUNNING' } });
    }
    await logger.info('Deployment finished successfully.');
    void captureDeploymentPreview(deploymentId, deployFqdn);
    if (!isPreview) {
      await notifyService(
        svc.id,
        'deployment_success',
        buildDeploymentMessage('success', {
          serviceName: svc.name,
          projectId: svc.projectId,
          projectName: svc.project.name,
          serviceId: svc.id,
          deploymentId,
          fqdn: svc.fqdn,
        }),
      );
    }
  } catch (err) {
    if (err instanceof DeploymentCancelledError) {
      await logger.info('Deployment cancelled.');
      if (!isPreview) {
        const prior = await hasPriorFinishedProduction(svc.id, deploymentId);
        await prisma.service.update({
          where: { id: svc.id },
          data: { status: statusAfterCancelledDeploy(prior) },
        });
      }
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const failed = await prisma.deployment.updateMany({
      where: { id: deploymentId, status: 'IN_PROGRESS' },
      data: { status: 'FAILED', finishedAt: new Date() },
    });
    if (failed.count === 0) {
      const row = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        select: { status: true },
      });
      if (row?.status === 'CANCELLED') {
        await logger.info('Deployment cancelled.');
        if (!isPreview) {
          const prior = await hasPriorFinishedProduction(svc.id, deploymentId);
          await prisma.service.update({
            where: { id: svc.id },
            data: { status: statusAfterCancelledDeploy(prior) },
          });
        }
        return;
      }
    }
    await logger.info(`Deployment failed: ${message}`);
    if (isPreview && deployment.pullRequestId != null) {
      try {
        await notifyPreviewDeployOutcome({
          serviceId: svc.id,
          pullRequestId: deployment.pullRequestId,
          phase: 'failed',
          fqdn: preview?.fqdn,
          commitSha: deployment.commitSha,
          error: message,
        });
      } catch (notifyErr) {
        await logger.info(
          `Preview notify after failure failed: ${
            notifyErr instanceof Error ? notifyErr.message : String(notifyErr)
          }`,
        );
      }
    } else {
      const prior = await hasPriorFinishedProduction(svc.id, deploymentId);
      await prisma.service.update({
        where: { id: svc.id },
        data: { status: statusAfterFailedDeploy(prior) },
      });
      await notifyService(
        svc.id,
        'deployment_failure',
        buildDeploymentMessage('failure', {
          serviceName: svc.name,
          projectId: svc.projectId,
          projectName: svc.project.name,
          serviceId: svc.id,
          deploymentId,
          fqdn: svc.fqdn,
          error: message,
        }),
      );
    }
    throw err;
  } finally {
    leaseHeartbeat.stop();
    await releaseDeployLease(deploymentId, leaseOwner);
    await promoteServerAfterSlotFreed(svc.serverId);
  }
}

/** Start/stop/restart a deployed service via compose. */
export async function controlService(serviceId: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc || !svc.serverId) throw new Error('Service or server missing.');
  const target = await sshTargetForServer(svc.serverId);
  const dir = serviceDir(svc);
  const cmd =
    action === 'stop'
      ? 'docker compose stop'
      : action === 'restart'
        ? 'docker compose restart'
        : 'docker compose up -d';
  await sshPool.exec(target, `cd ${dir} && ${cmd}`);
  await prisma.service.update({
    where: { id: serviceId },
    data: { status: action === 'stop' ? 'STOPPED' : 'RUNNING' },
  });
}

/**
 * Best-effort Docker teardown for a service (compose down + remove config dir).
 * Used when cascading server deletion.
 * Does not throw if the host is unreachable — caller still deletes the DB row.
 */
export async function teardownService(serviceId: string): Promise<void> {
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc?.serverId) return;
  const target = await sshTargetForServer(svc.serverId);
  const dir = shellSingleQuote(serviceDir(svc));
  await sshPool.exec(
    target,
    `if [ -d ${dir} ]; then cd ${dir} && docker compose down -v --remove-orphans || true; fi; rm -rf ${dir}`,
  );
}
