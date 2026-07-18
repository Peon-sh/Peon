import { registerHandler } from './index';
import { runBackup } from '../../src/services/internal/backup/engine';

registerHandler('backup.run', async (msg, ctx) => {
  ctx.log(`Running backup ${msg.backupId}`);
  await runBackup(msg.backupId, msg.executionId);
});
