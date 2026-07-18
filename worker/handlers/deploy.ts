import { registerHandler } from './index';
import { runDeployment } from '../../src/services/internal/deploy/engine';

registerHandler('deploy', async (msg, ctx) => {
  ctx.log(`Running deployment ${msg.deploymentId}`);
  await runDeployment(msg.deploymentId);
});

registerHandler('database.provision', async (msg, ctx) => {
  ctx.log(`Provisioning database (deployment ${msg.deploymentId})`);
  await runDeployment(msg.deploymentId);
});
