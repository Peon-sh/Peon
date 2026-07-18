import { prisma } from '@/lib/prisma';
import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { decrypt } from '@/lib/crypto/encryption';
import { engineSpec } from '@/lib/docker/databases';
import { containerName } from '@/lib/docker/naming';
import { uploadFileFromServer } from '@/services/external/s3/backup';
import { notifyService } from '@/services/internal/notifications/events';
import { ValidationError, NotFoundError } from '@/lib/errors';

export async function runBackup(backupId: string, executionId: string): Promise<void> {
  const backup = await prisma.scheduledBackup.findUnique({
    where: { id: backupId },
    include: { service: true, s3Storage: true },
  });
  if (!backup) throw new Error('Backup not found.');
  const svc = backup.service;
  if (svc.kind !== 'DATABASE' || !svc.serverId) throw new Error('Backup target is not a database.');

  const spec = engineSpec(svc.databaseEngine ?? 'POSTGRESQL');
  if (!spec.dumpCommand) throw new Error(`Backups not supported for ${spec.label}.`);

  const target = await sshTargetForServer(svc.serverId);
  const name = containerName(svc.name, svc.uuid);
  const creds = {
    username: svc.dbUsername,
    password: svc.dbPassword ? decrypt(svc.dbPassword) : undefined,
    database: svc.dbName,
    rootPassword: svc.dbRootPassword ? decrypt(svc.dbRootPassword) : undefined,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.sql`;
  const remotePath = `/data/peon/backups/${filename}`;

  try {
    const script = `mkdir -p /data/peon/backups && docker exec ${name} sh -c '${spec.dumpCommand(creds)}' > ${remotePath} && ls -la ${remotePath}`;
    const res = await sshPool.exec(target, script);
    if (res.code !== 0) throw new Error(res.stderr || 'Dump failed.');

    let s3Uploaded = false;
    if (backup.saveS3 && backup.s3Storage) {
      await uploadFileFromServer(target, remotePath, `backups/${svc.uuid}/${filename}`, backup.s3Storage);
      s3Uploaded = true;
    }

    await prisma.scheduledBackupExecution.update({
      where: { id: executionId },
      data: {
        status: 'SUCCESS',
        filename,
        databaseName: svc.dbName,
        s3Uploaded,
        finishedAt: new Date(),
      },
    });

    await enforceRetention(backupId, target);

    await notifyService(svc.id, 'backup_success', {
      subject: `Backup succeeded: ${svc.name}`,
      text: `Database backup for "${svc.name}" completed (${filename})${s3Uploaded ? ' and was uploaded to S3' : ''}.`,
    });
  } catch (err) {
    await prisma.scheduledBackupExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      },
    });
    await notifyService(svc.id, 'backup_failure', {
      subject: `Backup failed: ${svc.name}`,
      text: `Database backup for "${svc.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
}

/**
 * Restore a database from a previously-created local dump. `filename` must be a
 * dump that exists under the server's backup directory (e.g. from an execution
 * record). Streams the file into the engine's restore command inside the
 * running database container.
 */
export async function runRestore(serviceId: string, filename: string): Promise<void> {
  if (/[/\\]|\.\./.test(filename)) throw new ValidationError('Invalid backup filename.');
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc || svc.kind !== 'DATABASE' || !svc.serverId) {
    throw new ValidationError('Restore target is not a database.');
  }

  const spec = engineSpec(svc.databaseEngine ?? 'POSTGRESQL');
  if (!spec.restoreCommand) throw new ValidationError(`Restore not supported for ${spec.label}.`);

  const target = await sshTargetForServer(svc.serverId);
  const name = containerName(svc.name, svc.uuid);
  const creds = {
    username: svc.dbUsername,
    password: svc.dbPassword ? decrypt(svc.dbPassword) : undefined,
    database: svc.dbName,
    rootPassword: svc.dbRootPassword ? decrypt(svc.dbRootPassword) : undefined,
  };

  const remotePath = `/data/peon/backups/${filename}`;
  const check = await sshPool.exec(target, `test -f ${remotePath} && echo ok || echo missing`);
  if (!check.stdout.includes('ok')) throw new NotFoundError(`Backup file not found: ${filename}`);

  const script = `docker exec -i ${name} sh -c '${spec.restoreCommand(creds)}' < ${remotePath}`;
  const res = await sshPool.exec(target, script);
  if (res.code !== 0) throw new Error(res.stderr || 'Restore failed.');
}

async function enforceRetention(backupId: string, target: Awaited<ReturnType<typeof sshTargetForServer>>) {
  const backup = await prisma.scheduledBackup.findUnique({ where: { id: backupId } });
  if (!backup || backup.retentionAmountLocal <= 0) return;
  // Keep the most recent N local dumps for this service.
  const svc = await prisma.service.findFirst({ where: { scheduledBackups: { some: { id: backupId } } } });
  if (!svc) return;
  const name = containerName(svc.name, svc.uuid);
  const script = `cd /data/peon/backups 2>/dev/null && ls -1t ${name}-*.sql 2>/dev/null | tail -n +${backup.retentionAmountLocal + 1} | xargs -r rm -f || true`;
  await sshPool.exec(target, script);
}
