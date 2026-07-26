import type { QueueMessage, QueueName } from './messages';

/**
 * A received job, provider-agnostic.
 *
 * `receipt` is whatever the provider needs to acknowledge the job later — an SQS
 * receipt handle, a row id, anything. Callers must treat it as opaque.
 */
export interface ReceivedJob {
  /** Parsed message body. Providers reject unparseable payloads themselves. */
  message: QueueMessage;
  /** Opaque acknowledgement token, passed back to `deleteMessage`. */
  receipt: string;
  /** Delivery count when the provider tracks it (SQS does not, cheaply). */
  attempts?: number;
}

/**
 * Transport behind `enqueue()` and the worker loop.
 *
 * Modelled on the semantics the worker already relied on when SQS was the only
 * option, so a provider swap is invisible to `worker/handlers/*`:
 *
 * - `receiveMessages` long-polls up to `waitSeconds` and returns 0..max jobs.
 * - A received job is invisible to other consumers for a lease period. If it is
 *   not deleted within that window it becomes visible again — this is what makes
 *   a worker crash recoverable.
 * - `deleteMessage` acknowledges permanently.
 * - Anything not deleted is retried.
 */
export interface QueueProvider {
  /** Stable identifier for logs and diagnostics. */
  readonly name: 'sqs' | 'postgres';

  enqueue(message: QueueMessage): Promise<void>;

  receiveMessages(queue: QueueName, waitSeconds: number, max: number): Promise<ReceivedJob[]>;

  deleteMessage(queue: QueueName, receipt: string): Promise<void>;

  /**
   * Mark a job permanently failed rather than leaving it to retry. Providers
   * that cannot express this (SQS, where a dead-letter queue is server-side
   * configuration) may treat it as a delete.
   */
  failMessage?(queue: QueueName, receipt: string, error: string): Promise<void>;

  /** Release provider resources on shutdown. Optional. */
  shutdown?(): Promise<void>;
}
