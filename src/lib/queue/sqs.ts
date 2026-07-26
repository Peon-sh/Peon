/**
 * Compatibility shim.
 *
 * This module used to be the SQS implementation itself. It now re-exports the
 * provider-agnostic queue API so existing imports keep working while the
 * transport is selected by `QUEUE_DRIVER`.
 *
 * Prefer importing from `@/lib/queue` in new code.
 */
export {
  enqueue,
  receiveMessages,
  deleteMessage,
  failMessage,
  getQueueProvider,
  setQueueProvider,
  resolveQueueDriver,
  shutdownQueue,
} from './index';

export { queueUrl, isSqsConfigured } from './providers/sqs';
