import { registerHandler } from './index';
import type { HandlerContext } from './types';
import { prisma } from '../../src/lib/prisma';
import { ServerOperations } from '../../src/services/internal/server/operations';

function serverLog(serverId: string, operation: string, sessionId: string | undefined, ctx: HandlerContext) {
  return async (message: string, level = 'info') => {
    ctx.log(message);
    try {
      await prisma.serverOperationLog.create({ data: { serverId, sessionId, operation, level, message } });
    } catch (err) {
      ctx.log(`failed to persist operation log: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

registerHandler('server.validate', async (msg, ctx) => {
  const log = serverLog(msg.serverId, 'validate', msg.sessionId, ctx);
  try {
    await log('Starting server validation.');
    await ServerOperations.validate(msg.serverId, { installDocker: msg.installDocker }, log);
    await log('Validation completed.');
  } catch (err) {
    await log(err instanceof Error ? err.message : String(err), 'error');
    throw err;
  }
});

registerHandler('proxy', async (msg, ctx) => {
  const operation = `proxy.${msg.action}`;
  const log = serverLog(msg.serverId, operation, msg.sessionId, ctx);
  try {
    await log(`Starting proxy ${msg.action}.`);
    if (msg.action === 'stop') {
      await ServerOperations.stopProxy(msg.serverId, log);
    } else {
      await ServerOperations.startProxy(msg.serverId, log);
    }
    await log(`Proxy ${msg.action} completed.`);
  } catch (err) {
    await log(err instanceof Error ? err.message : String(err), 'error');
    throw err;
  }
});

registerHandler('server.cleanup', async (msg, ctx) => {
  const log = serverLog(msg.serverId, 'cleanup', msg.sessionId, ctx);
  try {
    await log('Starting server cleanup.');
    await ServerOperations.cleanup(msg.serverId, log);
    await log('Cleanup completed.');
  } catch (err) {
    await log(err instanceof Error ? err.message : String(err), 'error');
    throw err;
  }
});
