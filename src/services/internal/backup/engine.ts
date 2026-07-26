import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/prisma';
import { backupsDir } from '@/lib/paths';
import { executorForServer, type ServerExecutor } from '@/lib/executor';
import { decrypt } from '@/lib/crypto/encryption';
import { engineSpec } from '@/lib/docker/databases';
import { containerName } from '@/lib/docker/naming';
import { uploadFileFromServer } from '@/services/external/s3/backup';
import { notifyService } from '@/services/internal/notifications/events';
import { ValidationError, NotFoundError } from '@/lib/errors';

function assertSafeBackupFilename(filename: string): void {
  if (/[/\\]|\.\./.test(filename)) throw new ValidationError('Invalid backup filename.');
}

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

  const dumpAll = backup.dumpAll;
  const executor = await executorForServer(svc.serverId);
  const name = containerName(svc.name, svc.uuid);
  const creds = {
    username: svc.dbUsername,
    password: svc.dbPassword ? decrypt(svc.dbPassword) : undefined,
    database: svc.dbName,
    rootPassword: svc.dbRootPassword ? decrypt(svc.dbRootPassword) : undefined,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.sql`;
  const remotePath = `${backupsDir()}/${filename}`;

  try {
    const script = `mkdir -p ${backupsDir()} && docker exec ${name} sh -c '${spec.dumpCommand(creds, { dumpAll })}' > ${remotePath} && ls -la ${remotePath}`;
    const res = await executor.exec(script);
    if (res.code !== 0) throw new Error(res.stderr || 'Dump failed.');

    let s3Uploaded = false;
    if (backup.saveS3 && backup.s3Storage) {
      await uploadFileFromServer(executor, remotePath, `backups/${svc.uuid}/${filename}`, backup.s3Storage);
      s3Uploaded = true;
    }

    const sizeRes = await executor.exec(`stat -c %s ${remotePath} 2>/dev/null || stat -f %z ${remotePath}`);
    const sizeBytes = sizeRes.code === 0 ? sizeRes.stdout.trim() : null;

    await prisma.scheduledBackupExecution.update({
      where: { id: executionId },
      data: {
        status: 'SUCCESS',
        filename,
        databaseName: dumpAll ? '*' : svc.dbName,
        dumpAll,
        size: sizeBytes,
        s3Uploaded,
        finishedAt: new Date(),
      },
    });

    await enforceRetention(backupId, executor);

    await notifyService(svc.id, 'backup_success', {
      subject: `Backup succeeded: ${svc.name}`,
      text: `Database backup for "${svc.name}" completed (${filename})${dumpAll ? ' [entire instance]' : ''}${s3Uploaded ? ' and was uploaded to S3' : ''}.`,
    });
  } catch (err) {
    await prisma.scheduledBackupExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
        dumpAll,
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
  assertSafeBackupFilename(filename);
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc || svc.kind !== 'DATABASE' || !svc.serverId) {
    throw new ValidationError('Restore target is not a database.');
  }

  const spec = engineSpec(svc.databaseEngine ?? 'POSTGRESQL');
  if (!spec.restoreCommand) throw new ValidationError(`Restore not supported for ${spec.label}.`);

  const execution = await prisma.scheduledBackupExecution.findFirst({
    where: { filename, backup: { serviceId }, status: 'SUCCESS' },
    orderBy: { startedAt: 'desc' },
  });
  const dumpAll = execution?.dumpAll ?? true;

  const executor = await executorForServer(svc.serverId);
  const name = containerName(svc.name, svc.uuid);
  const creds = {
    username: svc.dbUsername,
    password: svc.dbPassword ? decrypt(svc.dbPassword) : undefined,
    database: svc.dbName,
    rootPassword: svc.dbRootPassword ? decrypt(svc.dbRootPassword) : undefined,
  };

  const remotePath = `${backupsDir()}/${filename}`;
  const check = await executor.exec(`test -f ${remotePath} && echo ok || echo missing`);
  if (!check.stdout.includes('ok')) throw new NotFoundError(`Backup file not found: ${filename}`);

  const script = `docker exec -i ${name} sh -c '${spec.restoreCommand(creds, { dumpAll })}' < ${remotePath}`;
  const res = await executor.exec(script);
  if (res.code !== 0) throw new Error(res.stderr || 'Restore failed.');
}

/**
 * Stream a local backup dump from the managed server to the caller.
 * Returns a web ReadableStream; cleans up the temp file when the stream ends.
 */
export async function openBackupDownload(
  serviceId: string,
  filename: string,
): Promise<{ stream: ReadableStream; filename: string; contentType: string; size: number }> {
  assertSafeBackupFilename(filename);
  const svc = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!svc || svc.kind !== 'DATABASE' || !svc.serverId) {
    throw new ValidationError('Download target is not a database.');
  }

  const execution = await prisma.scheduledBackupExecution.findFirst({
    where: { filename, backup: { serviceId }, status: 'SUCCESS' },
  });
  if (!execution) throw new NotFoundError('Backup execution not found for that filename.');

  const executor = await executorForServer(svc.serverId);
  const remotePath = `${backupsDir()}/${filename}`;
  const check = await executor.exec(`test -f ${remotePath} && echo ok || echo missing`);
  if (!check.stdout.includes('ok')) throw new NotFoundError(`Backup file not found: ${filename}`);

  const dir = await mkdtemp(join(tmpdir(), 'peon-backup-'));
  const localPath = join(dir, filename);
  try {
    await executor.getFile(remotePath, localPath);
    const fileStat = await stat(localPath);
    const nodeStream = createReadStream(localPath);
    const cleanup = async () => {
      nodeStream.destroy();
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    };
    nodeStream.on('close', () => {
      void cleanup();
    });
    nodeStream.on('error', () => {
      void cleanup();
    });

    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return {
      stream: webStream,
      filename,
      contentType: 'application/sql',
      size: fileStat.size,
    };
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

async function enforceRetention(backupId: string, executor: ServerExecutor) {
  const backup = await prisma.scheduledBackup.findUnique({ where: { id: backupId } });
  if (!backup || backup.retentionAmountLocal <= 0) return;
  // Keep the most recent N local dumps for this service.
  const svc = await prisma.service.findFirst({ where: { scheduledBackups: { some: { id: backupId } } } });
  if (!svc) return;
  const name = containerName(svc.name, svc.uuid);
  const script = `cd ${backupsDir()} 2>/dev/null && ls -1t ${name}-*.sql 2>/dev/null | tail -n +${backup.retentionAmountLocal + 1} | xargs -r rm -f || true`;
  await executor.exec(script);
}
