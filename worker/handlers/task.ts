import { registerHandler } from './index';
import { runScheduledTask } from '../../src/services/internal/task/engine';

registerHandler('task.run', async (msg, ctx) => {
  ctx.log(`Running task ${msg.taskId}`);
  await runScheduledTask(msg.taskId, msg.executionId);
});
