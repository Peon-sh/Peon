import type { QueueMessage } from '../../src/lib/queue/messages';

export interface HandlerContext {
  log: (msg: string) => void;
}

export type JobHandler<T extends QueueMessage = QueueMessage> = (
  message: T,
  ctx: HandlerContext,
) => Promise<void>;
