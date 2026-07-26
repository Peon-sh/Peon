import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { serverEnv } from '@/lib/env';
import { awsCredentialsIfConfigured, awsRegion } from '@/lib/aws/credentials';
import { type QueueMessage, type QueueName, queueForMessage } from '../messages';
import type { QueueProvider, ReceivedJob } from '../types';

/** SQS ReceiveMessage allows at most 10 messages per call. */
const SQS_RECEIVE_MAX = 10;

/** Matches the previous inline value; how long a claimed job stays invisible. */
const VISIBILITY_TIMEOUT_SECONDS = 900;

let client: SQSClient | null = null;

function getClient(): SQSClient {
  if (client) return client;
  const env = serverEnv();
  const credentials = awsCredentialsIfConfigured();
  client = new SQSClient({
    region: env.SQS_REGION || awsRegion(),
    ...(env.SQS_ENDPOINT ? { endpoint: env.SQS_ENDPOINT } : {}),
    ...(credentials ? { credentials } : {}),
  });
  return client;
}

export function queueUrl(name: QueueName): string {
  const env = serverEnv();
  const url = name === 'deployments' ? env.SQS_DEPLOYMENT_QUEUE_URL : env.SQS_TASKS_QUEUE_URL;
  if (!url) throw new Error(`Queue URL for "${name}" is not configured.`);
  return url;
}

/** True when both queue URLs are present — used to auto-select the driver. */
export function isSqsConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.SQS_DEPLOYMENT_QUEUE_URL && env.SQS_TASKS_QUEUE_URL);
}

/**
 * AWS SQS transport. Behaviour is unchanged from the pre-provider implementation
 * so existing installations keep working exactly as before.
 */
export class SqsQueueProvider implements QueueProvider {
  readonly name = 'sqs' as const;

  async enqueue(message: QueueMessage): Promise<void> {
    const queue = queueForMessage(message);
    await getClient().send(
      new SendMessageCommand({
        QueueUrl: queueUrl(queue),
        MessageBody: JSON.stringify(message),
      }),
    );
  }

  async receiveMessages(
    queue: QueueName,
    waitSeconds: number,
    max: number,
  ): Promise<ReceivedJob[]> {
    const res = await getClient().send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl(queue),
        WaitTimeSeconds: waitSeconds,
        MaxNumberOfMessages: Math.min(SQS_RECEIVE_MAX, Math.max(1, max)),
        VisibilityTimeout: VISIBILITY_TIMEOUT_SECONDS,
      }),
    );

    const jobs: ReceivedJob[] = [];
    for (const raw of res.Messages ?? []) {
      if (!raw.Body || !raw.ReceiptHandle) continue;
      let message: QueueMessage;
      try {
        message = JSON.parse(raw.Body) as QueueMessage;
      } catch {
        // Unparseable body can never succeed; drop it rather than redeliver.
        await this.deleteMessage(queue, raw.ReceiptHandle).catch(() => undefined);
        continue;
      }
      jobs.push({ message, receipt: raw.ReceiptHandle });
    }
    return jobs;
  }

  async deleteMessage(queue: QueueName, receipt: string): Promise<void> {
    await getClient().send(
      new DeleteMessageCommand({ QueueUrl: queueUrl(queue), ReceiptHandle: receipt }),
    );
  }

  /**
   * SQS has no client-side "fail permanently" — that is a dead-letter queue
   * configured on the queue itself. Deleting matches the old worker behaviour
   * for messages that can never succeed.
   */
  async failMessage(queue: QueueName, receipt: string): Promise<void> {
    await this.deleteMessage(queue, receipt);
  }
}

/** Reset the memoised client (tests). */
export function resetSqsClient(): void {
  client = null;
}
