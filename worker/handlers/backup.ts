import { registerHandler } from './index';
import { runBackup, runRestore } from '../../src/services/internal/backup/engine';
import { notifyService } from '../../src/services/internal/notifications/events';
import { prisma } from '../../src/lib/prisma';

registerHandler('backup.run', async (msg, ctx) => {
  ctx.log(`Running backup ${msg.backupId}`);
  await runBackup(msg.backupId, msg.executionId);
});

registerHandler('backup.restore', async (msg, ctx) => {
  ctx.log(`Restoring ${msg.filename} onto service ${msg.serviceId}`);
  const svc = await prisma.service.findUnique({
    where: { id: msg.serviceId },
    select: { id: true, name: true },
  });
  try {
    await runRestore(msg.serviceId, msg.filename);
    if (svc) {
      await notifyService(svc.id, 'backup_success', {
        subject: `Restore succeeded: ${svc.name}`,
        text: `Database restore for "${svc.name}" from ${msg.filename} completed.`,
      });
    }
  } catch (err) {
    if (svc) {
      await notifyService(svc.id, 'backup_failure', {
        subject: `Restore failed: ${svc.name}`,
        text: `Database restore for "${svc.name}" from ${msg.filename} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    throw err;
  }
});
