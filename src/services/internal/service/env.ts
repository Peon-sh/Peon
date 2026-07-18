import { prisma } from '@/lib/prisma';
import { encrypt, decryptNullable } from '@/lib/crypto/encryption';
import { AppError } from '@/lib/errors';
import type { UpsertEnvInput } from '@/schemas/service.schema';
import { MASK } from './shared';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

/**
 * List env vars. Values are masked unless `reveal` is set - callers must
 * gate revealed listings behind project-manage access.
 */
export async function listEnv(serviceId: string, opts: { reveal?: boolean } = {}) {
  const vars = await prisma.environmentVariable.findMany({
    where: { serviceId },
    orderBy: [{ isPreview: 'asc' }, { key: 'asc' }],
  });
  return vars.map((v) => ({
    id: v.id,
    key: v.key,
    value: opts.reveal ? (decryptNullable(v.value) ?? '') : MASK,
    isPreview: v.isPreview,
    isBuildtime: v.isBuildtime,
    isRuntime: v.isRuntime,
    isMultiline: v.isMultiline,
    isLiteral: v.isLiteral,
    comment: v.comment,
  }));
}

export async function bulkSaveEnv(
  serviceId: string,
  raw: string,
  opts: { isPreview?: boolean } = {},
) {
  const isPreview = opts.isPreview ?? false;
  const parsed: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new AppError(`Invalid variable key: "${key}"`);
    }
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  const existing = await prisma.environmentVariable.findMany({
    where: { serviceId, isPreview },
    select: { id: true, key: true },
  });
  const keep = new Set(Object.keys(parsed));
  const toDelete = existing.filter((v) => !keep.has(v.key)).map((v) => v.id);

  await prisma.$transaction(
    [
      ...(toDelete.length
        ? [prisma.environmentVariable.deleteMany({ where: { id: { in: toDelete } } })]
        : []),
      ...Object.entries(parsed).map(([key, value]) =>
        prisma.environmentVariable.upsert({
          where: { serviceId_key_isPreview: { serviceId, key, isPreview } },
          update: { value: encrypt(value) },
          create: { serviceId, key, value: encrypt(value), isPreview },
        }),
      ),
    ],
    { maxWait: 10_000, timeout: 60_000 },
  );
  const result = { saved: Object.keys(parsed).length, deleted: toDelete.length };
  await recordServiceAudit(serviceId, {
    action: 'service.env.bulk_saved',
    summary: `Bulk saved ${result.saved} env vars`,
    metadata: { keys: Object.keys(parsed), deleted: result.deleted, isPreview },
  });
  return result;
}

export async function importPreviewEnvFromProduction(serviceId: string) {
  const production = await prisma.environmentVariable.findMany({
    where: { serviceId, isPreview: false },
  });
  if (production.length === 0) {
    return { imported: 0 };
  }

  await prisma.$transaction(
    production.map((v) =>
      prisma.environmentVariable.upsert({
        where: {
          serviceId_key_isPreview: { serviceId, key: v.key, isPreview: true },
        },
        update: {
          value: v.value,
          isBuildtime: v.isBuildtime,
          isRuntime: v.isRuntime,
          isMultiline: v.isMultiline,
          isLiteral: v.isLiteral,
          comment: v.comment,
        },
        create: {
          serviceId,
          key: v.key,
          value: v.value,
          isPreview: true,
          isBuildtime: v.isBuildtime,
          isRuntime: v.isRuntime,
          isMultiline: v.isMultiline,
          isLiteral: v.isLiteral,
          comment: v.comment,
        },
      }),
    ),
    { maxWait: 10_000, timeout: 60_000 },
  );
  await recordServiceAudit(serviceId, {
    action: 'service.env.preview_imported',
    summary: `Imported ${production.length} preview env vars from production`,
    metadata: { keys: production.map((v) => v.key) },
  });
  return { imported: production.length };
}

export async function upsertEnv(serviceId: string, input: UpsertEnvInput) {
  const row = await prisma.environmentVariable.upsert({
    where: {
      serviceId_key_isPreview: {
        serviceId,
        key: input.key,
        isPreview: input.isPreview,
      },
    },
    update: {
      value: encrypt(input.value),
      isBuildtime: input.isBuildtime,
      isRuntime: input.isRuntime,
      isMultiline: input.isMultiline,
      isLiteral: input.isLiteral,
      comment: input.comment ?? null,
    },
    create: {
      serviceId,
      key: input.key,
      value: encrypt(input.value),
      isPreview: input.isPreview,
      isBuildtime: input.isBuildtime,
      isRuntime: input.isRuntime,
      isMultiline: input.isMultiline,
      isLiteral: input.isLiteral,
      comment: input.comment ?? null,
    },
  });
  await recordServiceAudit(serviceId, {
    action: 'service.env.upserted',
    summary: `Upserted env var ${input.key}`,
    metadata: { key: input.key, isPreview: input.isPreview },
  });
  return row;
}

export async function deleteEnv(serviceId: string, envId: string) {
  const existing = await prisma.environmentVariable.findFirst({
    where: { id: envId, serviceId },
    select: { key: true, isPreview: true },
  });
  await prisma.environmentVariable.deleteMany({ where: { id: envId, serviceId } });
  if (existing) {
    await recordServiceAudit(serviceId, {
      action: 'service.env.deleted',
      summary: `Deleted env var ${existing.key}`,
      metadata: { key: existing.key, isPreview: existing.isPreview },
    });
  }
}
