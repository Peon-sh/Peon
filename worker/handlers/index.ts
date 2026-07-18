import type { QueueMessage } from '../../src/lib/queue/messages';
import type { HandlerContext, JobHandler } from './types';

/**
 * Handler registry. Modules register concrete handlers here. Unregistered
 * message types fail loudly so misroutes are visible.
 */
const registry = new Map<QueueMessage['type'], JobHandler>();

export function registerHandler<K extends QueueMessage['type']>(
  type: K,
  handler: JobHandler<Extract<QueueMessage, { type: K }>>,
): void {
  registry.set(type, handler as JobHandler);
}

export async function dispatch(message: QueueMessage, ctx: HandlerContext): Promise<void> {
  const handler = registry.get(message.type);
  if (!handler) {
    throw new Error(`No handler registered for message type "${message.type}"`);
  }
  await handler(message, ctx);
}

/**
 * Import side-effecting handler modules so they register themselves.
 * New modules should be added here.
 */
export async function loadHandlers(): Promise<void> {
  await Promise.all([
    import('./deploy'),
    import('./server'),
    import('./service-control'),
    import('./backup'),
    import('./task'),
    import('./email'),
  ]);
}
