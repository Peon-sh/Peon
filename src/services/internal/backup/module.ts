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
      data: { backupId, status: 'RUNNING' },
    });
    await enqueue({ type: 'backup.run', backupId, executionId: execution.id });
    await recordServiceAudit(serviceId, {
      action: 'service.backup.run',
      summary: 'Queued backup run',
      metadata: { backupId, executionId: execution.id },
    });
    return execution;
  },

  async listExecutions(serviceId: string, backupId: string) {
    const backup = await prisma.scheduledBackup.findFirst({ where: { id: backupId, serviceId } });
    if (!backup) throw new NotFoundError('Backup schedule not found.');
    return prisma.scheduledBackupExecution.findMany({
      where: { backupId },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });
  },
};

export const BackupService = BackupModule;
