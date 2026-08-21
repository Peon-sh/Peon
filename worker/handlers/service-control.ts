import { registerHandler } from './index';
import { controlService } from '../../src/services/internal/deploy/engine';
import { ResumeFailedError } from '../../src/services/internal/deploy/status';
import { ServiceModule } from '../../src/services/internal/service/service';
import { recordServiceAudit } from '../../src/services/internal/audit/service-audit';

registerHandler('service.control', async (msg, ctx) => {
  ctx.log(`Service ${msg.serviceId}: ${msg.action}`);
  try {
    await controlService(msg.serviceId, msg.action);
  } catch (err) {
    if (!(err instanceof ResumeFailedError)) throw err;
    // The image was most likely pruned while the service sat suspended, so
    // there is nothing for compose to bring up. Rebuild instead of leaving the
    // user with a Resume button that never works.
    ctx.log(`Resume failed (${err.message}); falling back to a full rebuild.`);
    // The rebuild takes as long as any deploy, so record why it started: the
    // user only pressed Resume and would otherwise see an unexplained build.
    await recordServiceAudit(msg.serviceId, {
      action: 'service.resume_rebuild',
      summary: 'Resume could not start the existing containers; queued a full rebuild',
      metadata: { reason: err.message },
    });
    await ServiceModule.deploy(msg.serviceId, 'api', { force: true });
  }
});
