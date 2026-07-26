import { prisma } from '@/lib/prisma';
import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { executorForServer } from '@/lib/executor';
import type { ServerExecutor } from '@/lib/executor';
import {
  INSTALL_DOCKER_SCRIPT,
  INSTALL_PREREQUISITES_SCRIPT,
  SERVER_INFO_SCRIPT,
  startProxyScript,
  stopProxyScript,
  cleanupScript,
  proxyComposeFile,
  proxyComposePath,
  agentComposeFile,
  agentComposePath,
  startAgentScript,
  stopAgentScript,
} from '@/lib/scripts/server';
import { ensureAgentCredentials } from '@/services/internal/server/agent';
import { AuditService } from '@/services/internal/audit/audit';

export interface ServerInfo {
  os?: string;
  osId?: string;
  hasGit?: string;
  hasCurl?: string;
  hasJq?: string;
  docker?: string;
  dockerServerVersion?: string;
  compose?: string;
  cpu?: string;
  mem?: string;
  disk?: string;
}

const SUPPORTED_OS_IDS = new Set([
  'ubuntu',
  'debian',
  'raspbian',
  'pop',
  'centos',
  'fedora',
  'rhel',
  'ol',
  'rocky',
  'amzn',
  'almalinux',
  'sles',
  'opensuse-leap',
  'opensuse-tumbleweed',
  'arch',
  'alpine',
]);

const MIN_DOCKER_MAJOR_VERSION = 24;

function parseInfo(stdout: string): ServerInfo {
  const map: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k) map[k.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
  return {
    os: map.OS,
    osId: map.OS_ID,
    hasGit: map.HAS_GIT,
    hasCurl: map.HAS_CURL,
    hasJq: map.HAS_JQ,
    docker: map.DOCKER,
    dockerServerVersion: map.DOCKER_SERVER_VERSION,
    compose: map.COMPOSE,
    cpu: map.CPU,
    mem: map.MEM,
    disk: map.DISK,
  };
}

function missingPrerequisites(info: ServerInfo): string[] {
  const missing: string[] = [];
  if (info.hasGit !== 'yes') missing.push('git');
  if (info.hasCurl !== 'yes') missing.push('curl');
  if (info.hasJq !== 'yes') missing.push('jq');
  return missing;
}

function dockerMajor(version?: string): number | null {
  if (!version || version === 'none') return null;
  const major = Number(version.split('.')[0]);
  return Number.isFinite(major) ? major : null;
}


async function auditServer(serverId: string, action: string, summary: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, workspaceId: true },
  });
  if (!server) return;
  await AuditService.record({
    workspaceId: server.workspaceId,
    action,
    resourceType: 'server',
    resourceId: server.id,
    resourceName: server.name,
    summary,
  });
}

/** True when this server runs commands on the Peon host itself. */
async function isLocalServer(serverId: string): Promise<boolean> {
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: { executionMode: true },
  });
  return row?.executionMode === 'LOCAL';
}

/**
 * Reachability preamble.
 *
 * Split out because it is the one genuinely different step between transports:
 * a remote server is reached over SSH and may need its host key and pooled
 * session dropped, while the local server just needs a live Docker daemon.
 * Everything after this point is identical for both.
 */
async function assertReachable(
  serverId: string,
  executor: ServerExecutor,
  log: (m: string) => void | Promise<void>,
): Promise<void> {
  if (executor.mode === 'local') {
    await log('Checking the local Docker daemon…');
    const reach = await executor.pingWithError();
    if (!reach.ok) {
      await prisma.server.update({
        where: { id: serverId },
        data: { isReachable: false, isUsable: false },
      });
      throw new Error(`Local Docker is not reachable: ${reach.error}`);
    }
    await log('Local Docker daemon is reachable.');
    return;
  }

  const target = await sshTargetForServer(serverId);
  // Drop any pooled session so we never ping a previous host after IP/key changes.
  sshPool.disconnect(serverId);

  await log(`Connecting over SSH to ${target.username}@${target.host}:${target.port}…`);
  const reach = await executor.pingWithError();
  if (!reach.ok) {
    await prisma.server.update({
      where: { id: serverId },
      data: { isReachable: false, isUsable: false },
    });
    throw new Error(
      `Server is not reachable over SSH (${target.username}@${target.host}:${target.port}): ${reach.error}`,
    );
  }
  await log(`Server is reachable at ${target.username}@${target.host}:${target.port}.`);
}

export const ServerOperations = {
  /** Validate connectivity and gather info; optionally install Docker. */
  async validate(
    serverId: string,
    opts: { installDocker?: boolean } = {},
    log: (m: string) => void | Promise<void> = () => {},
  ) {
    const executor = await executorForServer(serverId);
    const local = executor.mode === 'local';

    await assertReachable(serverId, executor, log);

    // The Peon host provisions itself (installer or image), so the local server
    // never runs apt-get/systemctl from the worker — it usually has no
    // privileges to do so, and the packages are already present by construction.
    const installDocker = local ? false : opts.installDocker;

    let info = parseInfo((await executor.exec(SERVER_INFO_SCRIPT)).stdout);

    // The OS gate exists to stop Peon trying to provision a distro whose package
    // manager it does not know. The local host is already provisioned, so an
    // unrecognised distro there is not a reason to refuse.
    if (!local) {
      await log('Checking supported OS type…');
      const osId = info.osId?.toLowerCase();
      if (!osId || !SUPPORTED_OS_IDS.has(osId)) {
        await prisma.server.update({ where: { id: serverId }, data: { isReachable: true, isUsable: false } });
        throw new Error(`Supported OS type check failed. Detected: ${info.os || osId || 'unknown'}.`);
      }
      await log(`Supported OS type: ${info.os || osId}.`);
    }

    await log('Checking prerequisites…');
    let missing = missingPrerequisites(info);
    if (missing.length && installDocker) {
      await log(`Installing prerequisites: ${missing.join(', ')}.`);
      const res = await executor.execStream(INSTALL_PREREQUISITES_SCRIPT, (c) => void log(c.trimEnd()));
      if (res.code !== 0) throw new Error(`Prerequisites could not be installed: ${missing.join(', ')}.`);
      info = parseInfo((await executor.exec(SERVER_INFO_SCRIPT)).stdout);
      missing = missingPrerequisites(info);
    }
    if (missing.length) {
      await prisma.server.update({ where: { id: serverId }, data: { isReachable: true, isUsable: false } });
      throw new Error(`Prerequisites are not installed: ${missing.join(', ')}.`);
    }
    await log('Prerequisites are installed.');

    await log('Checking Docker Engine…');
    let dockerReady = !!info.docker && info.docker !== 'none';
    let composeReady = !!info.compose && info.compose !== 'none';
    if (installDocker && (!dockerReady || !composeReady)) {
      await log('Installing Docker Engine and Docker Compose…');
      const res = await executor.execStream(INSTALL_DOCKER_SCRIPT, (c) => void log(c.trimEnd()));
      if (res.code !== 0) throw new Error('Docker installation failed.');
      info = parseInfo((await executor.exec(SERVER_INFO_SCRIPT)).stdout);
      dockerReady = !!info.docker && info.docker !== 'none';
      composeReady = !!info.compose && info.compose !== 'none';
    }
    if (!dockerReady) {
      await prisma.server.update({ where: { id: serverId }, data: { isReachable: true, isUsable: false } });
      throw new Error('Docker is not installed or not running.');
    }
    await log('Docker is installed.');

    await log('Checking Docker Compose…');
    if (!composeReady) {
      await prisma.server.update({ where: { id: serverId }, data: { isReachable: true, isUsable: false } });
      throw new Error('Docker Compose is not installed.');
    }
    await log('Docker Compose is installed.');

    await log('Checking minimum Docker version…');
    const major = dockerMajor(info.dockerServerVersion);
    if (!major || major < MIN_DOCKER_MAJOR_VERSION) {
      await prisma.server.update({ where: { id: serverId }, data: { isReachable: true, isUsable: false } });
      throw new Error(`Minimum Docker version check failed. Required ${MIN_DOCKER_MAJOR_VERSION}.x, found ${info.dockerServerVersion || 'unknown'}.`);
    }
    await log(`Minimum Docker version is satisfied (${info.dockerServerVersion}).`);

    await prisma.server.update({
      where: { id: serverId },
      data: { isReachable: true, isUsable: dockerReady },
    });
    await prisma.serverSetting.updateMany({
      where: { serverId },
      data: { isReachable: true, isUsable: dockerReady },
    });

    await log('Server is ready.');

    // Install / refresh peon-ping-pong monitoring agent on every successful connect.
    if (dockerReady) {
      try {
        await this.startAgent(serverId, log);
      } catch (err) {
        await log(
          `Warning: peon-ping-pong agent install failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Do not fail validation — server is still usable without agent.
      }
    }

    await auditServer(serverId, 'server.validated', 'Validated server');
    return info;
  },

  async startAgent(serverId: string, log: (m: string) => void | Promise<void> = () => {}) {
    const executor = await executorForServer(serverId);
    const creds = await ensureAgentCredentials(serverId);
    await log('Installing peon-ping-pong monitoring agent…');
    await executor.exec(`mkdir -p ${agentComposePath()}/data`);
    await executor.putContent(
      `${agentComposePath()}/docker-compose.yml`,
      agentComposeFile({
        token: creds.token,
        pushEndpoint: creds.pushEndpoint,
        serverId: creds.serverId,
      }),
    );
    const res = await executor.execStream(startAgentScript(), (c) => void log(c.trimEnd()));
    if (res.code !== 0) throw new Error('Failed to start peon-ping-pong agent.');
    await log('peon-ping-pong agent is running.');
  },

  async stopAgent(serverId: string, log: (m: string) => void | Promise<void> = () => {}) {
    const executor = await executorForServer(serverId);
    await executor.execStream(stopAgentScript(), (c) => void log(c.trimEnd()));
    await prisma.serverSetting.updateMany({
      where: { serverId },
      data: { isSentinelEnabled: false },
    });
  },

  async startProxy(serverId: string, log: (m: string) => void | Promise<void> = () => {}) {
    const executor = await executorForServer(serverId);
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    const proxyType = server?.proxyType ?? 'TRAEFIK';
    await log(`Writing ${proxyType} proxy configuration…`);
    await executor.exec(`mkdir -p ${proxyComposePath()}`);
    await executor.putContent(
      `${proxyComposePath()}/docker-compose.yml`,
      proxyComposeFile(proxyType),
    );
    const res = await executor.execStream(startProxyScript(), (c) => void log(c.trimEnd()));
    if (res.code !== 0) throw new Error('Failed to start proxy.');
    await prisma.server.update({ where: { id: serverId }, data: { proxyStatus: 'running' } });
    await auditServer(serverId, 'server.proxy.started', 'Started server proxy');
  },

  async stopProxy(serverId: string, log: (m: string) => void | Promise<void> = () => {}) {
    const executor = await executorForServer(serverId);
    await executor.execStream(stopProxyScript(), (c) => void log(c.trimEnd()));
    await prisma.server.update({ where: { id: serverId }, data: { proxyStatus: 'exited' } });
    await auditServer(serverId, 'server.proxy.stopped', 'Stopped server proxy');
  },

  async cleanup(serverId: string, log: (m: string) => void | Promise<void> = () => {}) {
    const settings = await prisma.serverSetting.findUnique({ where: { serverId } });
    const deleteUnusedVolumes = settings?.deleteUnusedVolumes ?? false;
    const deleteUnusedNetworks = settings?.deleteUnusedNetworks ?? false;
    await log(
      `Running docker cleanup (volumes=${deleteUnusedVolumes}, networks=${deleteUnusedNetworks}).`,
    );
    const executor = await executorForServer(serverId);
    await executor.execStream(
      cleanupScript({ deleteUnusedVolumes, deleteUnusedNetworks }),
      (c) => void log(c.trimEnd()),
    );
    await auditServer(serverId, 'server.cleanup_queued', 'Ran server Docker cleanup');
  },
};

export { isLocalServer };
