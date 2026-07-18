import { prisma } from '@/lib/prisma';
import type { BuildPack, Prisma, ServiceKind } from '@/lib/prisma';
import { encrypt, decryptNullable } from '@/lib/crypto/encryption';
import {
  DEFAULT_NODE_BUILD_VERSION,
  NIXPACKS_NODE_VERSION_KEY,
  buildPackNeedsNodeVersion,
} from '@/lib/deploy/build-pack-env';
import { normalizeDockerfileLocation, normalizeRepoPath } from '@/lib/deploy/paths';
import { engineSpec } from '@/lib/docker/databases';
import { containerName } from '@/lib/docker/naming';
import { composeConfigSections, type ConfigSection } from '@/lib/service-config';
import { getTemplate } from '@/lib/templates';
import { generateMagicEnv, parseEnvSeed } from '@/lib/templates/magic-env';
import { slugify } from '@/lib/utils/slug';
import { NotFoundError, AppError } from '@/lib/errors';
import type { CreateServiceInput, UpdateServiceInput } from '@/schemas/service.schema';
import { MASK, randomToken } from './shared';
import { applyReconciledStatus, deploymentHintsForServices } from './status-read';
import { AuditService } from '@/services/internal/audit/audit';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

const SERVICE_SETTING_FIELDS = [
  'isAutoDeployEnabled',
  'isPreviewDeploymentsEnabled',
  'isForceHttpsEnabled',
  'isGzipEnabled',
  'isStripprefixEnabled',
  'isStatic',
  'isSpa',
  'disableBuildCache',
  'isConsistentContainerNameEnabled',
  'isRawComposeDeploymentEnabled',
  'rollingUpdate',
  'customDockerRunOptions',
  'preDeployCommand',
  'postDeployCommand',
  'customLabels',
  'watchPaths',
  'dockerImagesToKeep',
  'stopGracePeriod',
  'cpuLimit',
  'memoryLimit',
] as const;

function slugForDb(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'app';
}

/** Map a build-pack-style ServiceKind to its BuildPack, when applicable. */
function buildPackForKind(input: CreateServiceInput): BuildPack | null {
  switch (input.kind) {
    case 'GIT_APP':
      return input.buildPack;
    case 'DOCKERFILE':
      return 'DOCKERFILE';
    case 'NIXPACKS':
      return 'NIXPACKS';
    case 'STATIC':
      return 'STATIC';
    case 'DOCKER_IMAGE':
      return 'DOCKERIMAGE';
    case 'COMPOSE':
      return 'DOCKERCOMPOSE';
    default:
      return null;
  }
}

/**
 * Default: seed NIXPACKS_NODE_VERSION=22 as a build-time-only
 * env var for Nixpacks/Railpack apps. Does not overwrite an existing value.
 */
async function ensureDefaultNixpacksNodeEnv(
  serviceId: string,
  buildPack: BuildPack | null | undefined,
): Promise<void> {
  if (!buildPackNeedsNodeVersion(buildPack)) return;

  await prisma.environmentVariable.upsert({
    where: {
      serviceId_key_isPreview: {
        serviceId,
        key: NIXPACKS_NODE_VERSION_KEY,
        isPreview: false,
      },
    },
    create: {
      serviceId,
      key: NIXPACKS_NODE_VERSION_KEY,
      value: encrypt(DEFAULT_NODE_BUILD_VERSION),
      isPreview: false,
      isBuildtime: true,
      isRuntime: false,
      comment: 'Node.js major version for Nixpacks builds',
    },
    update: {},
  });
}

export async function listByProject(projectId: string) {
  const services = await prisma.service.findMany({
    where: { projectId, deletedAt: null },
    include: {
      settings: true,
      _count: { select: { deployments: true, environmentVars: true, persistentVolumes: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const hints = await deploymentHintsForServices(services.map((s) => s.id));
  return services.map((svc) => applyReconciledStatus(svc, hints.get(svc.id)));
}

export async function get(serviceId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, deletedAt: null },
    include: {
      settings: true,
      server: {
        select: {
          id: true,
          name: true,
          ip: true,
          settings: { select: { wildcardDomain: true } },
        },
      },
      destination: { select: { id: true, name: true, network: true } },
      _count: {
        select: {
          deployments: true,
          environmentVars: true,
          persistentVolumes: true,
          previews: true,
          webhooks: true,
        },
      },
    },
  });
  if (!service) throw new NotFoundError('Service not found.');
  const hints = await deploymentHintsForServices([service.id]);
  const reconciled = applyReconciledStatus(service, hints.get(service.id));
  // Never leak decrypted secrets.
  return {
    ...reconciled,
    dbPassword: reconciled.dbPassword ? MASK : null,
    dbRootPassword: reconciled.dbRootPassword ? MASK : null,
  };
}

/** Resolve the projectId for a service (for access checks). */
export async function projectIdFor(serviceId: string): Promise<string> {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { projectId: true },
  });
  if (!svc) throw new NotFoundError('Service not found.');
  return svc.projectId;
}

export async function create(projectId: string, input: CreateServiceInput) {
  const data: Prisma.ServiceCreateInput = {
    name: input.name,
    description: input.description,
    kind: input.kind as ServiceKind,
    project: { connect: { id: projectId } },
    settings: { create: {} },
  };

  if (input.serverId) data.server = { connect: { id: input.serverId } };
  if (input.destinationId) data.destination = { connect: { id: input.destinationId } };

  const buildPack = buildPackForKind(input);
  if (buildPack) data.buildPack = buildPack;

  switch (input.kind) {
    case 'GIT_APP':
    case 'DOCKERFILE':
    case 'NIXPACKS':
    case 'STATIC': {
      data.gitRepository = input.gitRepository;
      data.gitBranch = input.gitBranch;
      data.gitSourceType = input.gitSourceType;
      data.baseDirectory = input.baseDirectory;
      if (input.repositoryProjectId != null) {
        data.repositoryProjectId = input.repositoryProjectId;
      }
      if (input.ports) data.ports = input.ports;
      if (input.publishDirectory) data.publishDirectory = input.publishDirectory;
      if (input.githubAppId) data.githubApp = { connect: { id: input.githubAppId } };
      if (input.gitlabAppId) data.gitlabApp = { connect: { id: input.gitlabAppId } };
      if (input.privateKeyId) data.privateKey = { connect: { id: input.privateKeyId } };
      const useDockerfile =
        input.kind === 'DOCKERFILE' || (input.kind === 'GIT_APP' && buildPack === 'DOCKERFILE');
      if (useDockerfile) {
        if ('dockerfileContent' in input && input.dockerfileContent !== undefined) {
          data.dockerfileContent = input.dockerfileContent;
        }
        const path =
          'dockerfilePath' in input && typeof input.dockerfilePath === 'string'
            ? input.dockerfilePath
            : '/Dockerfile';
        data.dockerfilePath = normalizeDockerfileLocation(path);
      }
      if (input.baseDirectory) {
        data.baseDirectory = normalizeRepoPath(input.baseDirectory, '/');
      }
      break;
    }
    case 'DOCKER_IMAGE': {
      data.dockerRegistryImage = input.dockerRegistryImage;
      data.dockerRegistryTag = input.dockerRegistryTag;
      if (input.ports) data.ports = input.ports;
      break;
    }
    case 'COMPOSE': {
      data.dockerComposeRaw = input.dockerComposeRaw;
      break;
    }
    case 'DATABASE': {
      const spec = engineSpec(input.databaseEngine);
      const username = input.dbUsername || 'peon';
      const password = randomToken(18);
      const rootPassword = randomToken(18);
      data.databaseEngine = input.databaseEngine;
      data.databaseImage = input.databaseImage || spec.defaultImage;
      data.dbUsername = username;
      data.dbName = input.dbName || slugForDb(input.name);
      data.dbPassword = encrypt(password);
      data.dbRootPassword = encrypt(rootPassword);
      break;
    }
  }

  const service = await prisma.service.create({ data, include: { settings: true } });
  await ensureDefaultNixpacksNodeEnv(service.id, buildPack);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  if (project) {
    await AuditService.record({
      workspaceId: project.workspaceId,
      action: 'service.created',
      resourceType: 'service',
      resourceId: service.id,
      resourceName: service.name,
      summary: `Created service "${service.name}"`,
      metadata: { kind: service.kind },
    });
  }
  return service;
}

/**
 * Create a service from a one-click template: a COMPOSE service seeded with
 * the template's compose file plus generated magic env vars
 * (SERVICE_PASSWORD_*, SERVICE_FQDN_*, …) so it deploys out of the box.
 */
export async function createFromTemplate(
  projectId: string,
  input: { slug: string; name?: string; serverId?: string; destinationId?: string },
) {
  const template = getTemplate(input.slug);
  if (!template) throw new NotFoundError(`Template "${input.slug}" not found.`);

  let baseDomain: string | null = null;
  if (input.serverId) {
    const server = await prisma.server.findUnique({
      where: { id: input.serverId },
      select: { ip: true, settings: { select: { wildcardDomain: true } } },
    });
    if (server) baseDomain = server.settings?.wildcardDomain || `${server.ip}.sslip.io`;
  }

  const service = await prisma.service.create({
    data: {
      name: input.name || template.slug,
      description: template.slogan || null,
      kind: 'COMPOSE',
      buildPack: 'DOCKERCOMPOSE',
      dockerComposeRaw: template.compose,
      templateSlug: template.slug,
      project: { connect: { id: projectId } },
      ...(input.serverId ? { server: { connect: { id: input.serverId } } } : {}),
      ...(input.destinationId ? { destination: { connect: { id: input.destinationId } } } : {}),
      settings: { create: {} },
    },
    include: { settings: true },
  });

  const magic = generateMagicEnv(template.compose, {
    serviceSlug: slugify(template.slug),
    serviceUuid: service.id,
    baseDomain,
    https: false,
  });

  // Seed env file values, resolving references to generated magic vars.
  const seed = template.envs ? parseEnvSeed(template.envs) : {};
  for (const [key, rawValue] of Object.entries(seed)) {
    if (magic[key] !== undefined) continue;
    const value = rawValue.replace(
      /\$\{?(SERVICE_[A-Z0-9_]+)\}?/g,
      (_, k: string) => magic[k] ?? '',
    );
    magic[key] = value;
  }

  if (Object.keys(magic).length > 0) {
    await prisma.environmentVariable.createMany({
      data: Object.entries(magic).map(([key, value]) => ({
        serviceId: service.id,
        key,
        value: encrypt(value),
      })),
      skipDuplicates: true,
    });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  if (project) {
    await AuditService.record({
      workspaceId: project.workspaceId,
      action: 'service.created',
      resourceType: 'service',
      resourceId: service.id,
      resourceName: service.name,
      summary: `Created service "${service.name}" from template`,
      metadata: { template: input.slug },
    });
  }
  return service;
}

export async function update(serviceId: string, input: UpdateServiceInput) {
  const serviceData = { ...input } as Record<string, unknown>;
  const settingsData: Record<string, unknown> = {};

  for (const field of SERVICE_SETTING_FIELDS) {
    if (field in serviceData) {
      settingsData[field] = serviceData[field];
      delete serviceData[field];
    }
  }

  // Path normalization for Dockerfile builds.
  if (typeof serviceData.baseDirectory === 'string') {
    serviceData.baseDirectory = normalizeRepoPath(serviceData.baseDirectory, '/');
  }
  if (typeof serviceData.dockerfilePath === 'string') {
    serviceData.dockerfilePath = normalizeDockerfileLocation(serviceData.dockerfilePath);
  }

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: serviceData as Prisma.ServiceUpdateInput,
  });
  if (Object.keys(settingsData).length > 0) {
    await prisma.serviceSetting.upsert({
      where: { serviceId },
      create: { serviceId, ...settingsData } as Prisma.ServiceSettingUncheckedCreateInput,
      update: settingsData as Prisma.ServiceSettingUpdateInput,
    });
  }
  if (input.buildPack !== undefined) {
    await ensureDefaultNixpacksNodeEnv(serviceId, input.buildPack);
  }
  if (input.fqdn !== undefined) {
    await recordServiceAudit(serviceId, {
      action: 'service.domains.updated',
      summary: `Updated domains for "${service.name}"`,
      metadata: { fqdn: input.fqdn },
    });
  } else {
    await recordServiceAudit(serviceId, {
      action: 'service.updated',
      summary: `Updated service "${service.name}"`,
      metadata: { fields: Object.keys(input) },
    });
  }
  return service;
}

/**
 * Resolve the service-specific configuration form: declared sections plus
 * current (decrypted) values. Secrets are revealed here, so callers must
 * gate this behind project-manage access.
 */
export async function getServiceConfig(
  serviceId: string,
): Promise<{ sections: ConfigSection[]; values: Record<string, string> }> {
  const svc = await prisma.service.findFirst({
    where: { id: serviceId, deletedAt: null },
    include: {
      server: { select: { ip: true } },
      environmentVars: { where: { isPreview: false } },
    },
  });
  if (!svc) throw new NotFoundError('Service not found.');

  if (svc.kind === 'DATABASE' && svc.databaseEngine) {
    const spec = engineSpec(svc.databaseEngine);
    const creds = {
      username: svc.dbUsername,
      password: decryptNullable(svc.dbPassword),
      database: svc.dbName,
      rootPassword: decryptNullable(svc.dbRootPassword),
    };
    const values: Record<string, string> = {
      databaseImage: svc.databaseImage ?? spec.defaultImage,
      dbUsername: creds.username ?? '',
      dbPassword: creds.password ?? '',
      dbName: creds.database ?? '',
      dbRootPassword: creds.rootPassword ?? '',
    };
    const fields = [
      { key: 'databaseImage', label: 'Image', source: 'column' as const },
      ...spec.credentialFields.map((f) => ({
        key: f.column,
        label: f.label,
        source: 'column' as const,
        isPassword: f.isPassword,
        required: true,
      })),
    ];
    const sections: ConfigSection[] = [
      { id: 'general', title: `${spec.label} Configuration`, fields },
    ];

    if (spec.connectionUrl) {
      const internalHost = containerName(svc.name, svc.uuid);
      const urls: ConfigSection = { id: 'urls', title: 'Connection URLs', fields: [] };
      urls.fields.push({
        key: 'urlInternal',
        label: `${spec.label} URL (internal)`,
        source: 'column',
        readonly: true,
        isPassword: true,
        helper: 'Reachable from other services on the same Docker network.',
      });
      values.urlInternal = spec.connectionUrl(creds, internalHost, spec.internalPort);
      const publiclyReady = svc.databasePublic && svc.databasePublicPort && svc.server?.ip;
      urls.fields.push({
        key: 'urlPublic',
        label: `${spec.label} URL (public)`,
        source: 'column',
        readonly: true,
        isPassword: true,
        helper: publiclyReady
          ? 'Reachable from the internet via the exposed public port.'
          : 'Enable public access and set a public port to generate this.',
      });
      values.urlPublic = publiclyReady
        ? spec.connectionUrl(creds, svc.server!.ip, svc.databasePublicPort!)
        : '';
      sections.push(urls);
    }
    return { sections, values };
  }

  if (svc.kind === 'COMPOSE') {
    const sections = composeConfigSections(svc.templateSlug, svc.environmentVars.map((v) => v.key));
    const byKey = new Map(svc.environmentVars.map((v) => [v.key, v.value]));
    const values: Record<string, string> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        const raw = byKey.get(field.key);
        values[field.key] = raw ? (decryptNullable(raw) ?? '') : '';
      }
    }
    return { sections, values };
  }

  return { sections: [], values: {} };
}

/** Persist edited service-config values back to columns / env vars. */
export async function updateServiceConfig(serviceId: string, values: Record<string, string>) {
  const svc = await prisma.service.findFirst({ where: { id: serviceId, deletedAt: null } });
  if (!svc) throw new NotFoundError('Service not found.');

  if (svc.kind === 'DATABASE') {
    const data: Prisma.ServiceUpdateInput = {};
    if (values.databaseImage !== undefined) data.databaseImage = values.databaseImage || null;
    if (values.dbUsername !== undefined) data.dbUsername = values.dbUsername || null;
    if (values.dbName !== undefined) data.dbName = values.dbName || null;
    if (values.dbPassword) data.dbPassword = encrypt(values.dbPassword);
    if (values.dbRootPassword) data.dbRootPassword = encrypt(values.dbRootPassword);
    await prisma.service.update({ where: { id: serviceId }, data });
    await recordServiceAudit(serviceId, {
      action: 'service.config.updated',
      summary: `Updated database config for "${svc.name}"`,
      metadata: { keys: Object.keys(values).filter((k) => !k.toLowerCase().includes('password')) },
    });
    return;
  }

  if (svc.kind === 'COMPOSE') {
    for (const [key, value] of Object.entries(values)) {
      await prisma.environmentVariable.upsert({
        where: { serviceId_key_isPreview: { serviceId, key, isPreview: false } },
        update: { value: encrypt(value) },
        create: { serviceId, key, value: encrypt(value), isPreview: false },
      });
    }
    await recordServiceAudit(serviceId, {
      action: 'service.config.updated',
      summary: `Updated compose config for "${svc.name}"`,
      metadata: { keys: Object.keys(values) },
    });
    return;
  }

  throw new AppError('This service kind has no service-specific configuration.');
}

export async function remove(serviceId: string) {
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true, project: { select: { workspaceId: true } } },
  });
  await prisma.service.delete({ where: { id: serviceId } });
  if (svc) {
    await AuditService.record({
      workspaceId: svc.project.workspaceId,
      action: 'service.deleted',
      resourceType: 'service',
      resourceId: svc.id,
      resourceName: svc.name,
      summary: `Deleted service "${svc.name}"`,
    });
  }
}

export async function setServer(serviceId: string, serverId: string, destinationId?: string | null) {
  const service = await prisma.service.update({
    where: { id: serviceId },
    data: { serverId, destinationId: destinationId ?? null },
  });
  await recordServiceAudit(serviceId, {
    action: 'service.updated',
    summary: `Assigned server for "${service.name}"`,
    metadata: { serverId, destinationId: destinationId ?? null },
  });
  return service;
}
