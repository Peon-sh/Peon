import { registerHandler } from './index';
import { controlService } from '../../src/services/internal/deploy/engine';

registerHandler('service.control', async (msg, ctx) => {
  ctx.log(`Service ${msg.serviceId}: ${msg.action}`);
  await controlService(msg.serviceId, msg.action);
});
