import { prisma } from '@/lib/prisma';
import { engineSpec } from '@/lib/docker/databases';
import { enqueue } from '@/lib/queue/sqs';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { UpsertBackupInput } from '@/schemas/service.schema';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

/**
 * Scheduled database backup management. Execution itself lives in
 * `engine.ts` (worker); the scheduler enqueues due backups every minute.
 */
export const BackupModule = {
  async assertBackupable(serviceId: string) {
    const svc = await prisma.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: { id: true, kind: true, databaseEngine: true },
    });
    if (!svc) throw new NotFoundError('Service not found.');
    if (svc.kind !== 'DATABASE' || !svc.databaseEngine) {
      throw new ValidationError('Backups are only available for database services.');
    }
    if (!engineSpec(svc.databaseEngine).dumpCommand) {
      throw new ValidationError(`Backups are not supported for ${engineSpec(svc.databaseEngine).label}.`);
    }
    return svc;
  },

  list(serviceId: string) {
    return prisma.scheduledBackup.findMany({
      where: { serviceId },
      include: {
        s3Storage: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(serviceId: string, input: UpsertBackupInput) {
    await this.assertBackupable(serviceId);
    const backup = await prisma.scheduledBackup.create({
      data: {
        serviceId,
        frequency: input.frequency,
        enabled: input.enabled,
        saveS3: input.saveS3,
        s3StorageId: input.saveS3 ? (input.s3StorageId ?? null) : null,
        retentionAmountLocal: input.retentionAmountLocal,
        dumpAll: input.dumpAll,
      },
    });
    await recordServiceAudit(serviceId, {
      action: 'service.backup.created',
      summary: 'Created backup schedule',
      metadata: { backupId: backup.id },
    });
    return backup;
  },

  async update(serviceId: string, backupId: string, input: Partial<UpsertBackupInput>) {
    const backup = await prisma.scheduledBackup.findFirst({ where: { id: backupId, serviceId } });
    if (!backup) throw new NotFoundError('Backup schedule not found.');
    const updated = await prisma.scheduledBackup.update({
      where: { id: backupId },
      data: {
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.saveS3 !== undefined ? { saveS3: input.saveS3 } : {}),
        ...(input.s3StorageId !== undefined ? { s3StorageId: input.s3StorageId } : {}),
        ...(input.retentionAmountLocal !== undefined
          ? { retentionAmountLocal: input.retentionAmountLocal }
          : {}),
        ...(input.dumpAll !== undefined ? { dumpAll: input.dumpAll } : {}),
      },
    });
    await recordServiceAudit(serviceId, {
      action: 'service.backup.updated',
      summary: 'Updated backup schedule',
      metadata: { backupId },
    });
    return updated;
  },

  async remove(serviceId: string, backupId: string) {
    const backup = await prisma.scheduledBackup.findFirst({ where: { id: backupId, serviceId } });
    if (!backup) throw new NotFoundError('Backup schedule not found.');
    await prisma.scheduledBackup.delete({ where: { id: backupId } });
    await recordServiceAudit(serviceId, {
      action: 'service.backup.deleted',
      summary: 'Deleted backup schedule',
      metadata: { backupId },
    });
  },

  /** Trigger an immediate backup run through the worker queue. */
  async runNow(serviceId: string, backupId: string) {
    const backup = await prisma.scheduledBackup.findFirst({ where: { id: backupId, serviceId } });
    if (!backup) throw new NotFoundError('Backup schedule not found.');
    const execution = await prisma.scheduledBackupExecution.create({
      data: { backupId, status: 'RUNNING', dumpAll: backup.dumpAll },
    });
    await enqueue({ type: 'backup.run', backupId, executionId: execution.id });
    await recordServiceAudit(serviceId, {
      action: 'service.backup.run',
      summary: 'Queued backup run',
      metadata: { backupId, executionId: execution.id },
    });
    return execution;
  },

  /** Queue a restore from a local dump filename. */
  async queueRestore(serviceId: string, filename: string) {
    if (/[/\\]|\.\./.test(filename)) throw new ValidationError('Invalid backup filename.');
    const svc = await this.assertBackupable(serviceId);
    const spec = engineSpec(svc.databaseEngine!);
    if (!spec.restoreCommand) {
      throw new ValidationError(`Restore is not supported for ${spec.label}.`);
    }

    const execution = await prisma.scheduledBackupExecution.findFirst({
      where: { filename, backup: { serviceId }, status: 'SUCCESS' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!execution) throw new NotFoundError('Backup execution not found for that filename.');

    await enqueue({ type: 'backup.restore', serviceId, filename });
    await recordServiceAudit(serviceId, {
      action: 'service.backup.restore',
      summary: 'Queued backup restore',
      metadata: { filename },
    });
    return { queued: true as const, filename };
  },

  async listExecutions(
    serviceId: string,
    backupId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ) {
    const backup = await prisma.scheduledBackup.findFirst({ where: { id: backupId, serviceId } });
    if (!backup) throw new NotFoundError('Backup schedule not found.');

    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 50);
    const rows = await prisma.scheduledBackupExecution.findMany({
      where: { backupId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, nextCursor };
  },
};

export const BackupService = BackupModule;
