import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  type Message,
} from '@aws-sdk/client-sqs';
import { serverEnv } from '@/lib/env';
import { isE2eMode } from '@/lib/e2e';
import { awsCredentialsIfConfigured, awsRegion } from '@/lib/aws/credentials';
import { type QueueMessage, type QueueName, queueForMessage } from './messages';
import { startIntervalHeartbeat } from './visibility-heartbeat';

/** Time a received message stays invisible before SQS redelivers it. */
export const SQS_VISIBILITY_TIMEOUT_SECONDS = 900;

/** Refresh visibility well before expiry so long builds are not redelivered. */
export const SQS_VISIBILITY_HEARTBEAT_MS = 60_000;

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

/** Enqueue a job. Routing to the correct queue is automatic. */
export async function enqueue(message: QueueMessage): Promise<void> {
  if (isE2eMode()) return;
  const name = queueForMessage(message);
  await getClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl(name),
      MessageBody: JSON.stringify(message),
    }),
  );
}

export async function receiveMessages(
  name: QueueName,
  waitSeconds: number,
  max = 1,
): Promise<Message[]> {
  const res = await getClient().send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl(name),
      WaitTimeSeconds: waitSeconds,
      MaxNumberOfMessages: max,
      VisibilityTimeout: SQS_VISIBILITY_TIMEOUT_SECONDS,
    }),
  );
  return res.Messages ?? [];
}

export async function deleteMessage(name: QueueName, receiptHandle: string): Promise<void> {
  await getClient().send(
    new DeleteMessageCommand({ QueueUrl: queueUrl(name), ReceiptHandle: receiptHandle }),
  );
}

export async function extendMessageVisibility(
  name: QueueName,
  receiptHandle: string,
  timeoutSeconds = SQS_VISIBILITY_TIMEOUT_SECONDS,
): Promise<void> {
  if (isE2eMode()) return;
  await getClient().send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl(name),
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: timeoutSeconds,
    }),
  );
}

/**
 * Keep an in-flight SQS message hidden until `fn` returns.
 * Without this, jobs longer than {@link SQS_VISIBILITY_TIMEOUT_SECONDS} are
 * redelivered and a second worker starts the same deployment.
 */
export async function withVisibilityHeartbeat<T>(
  name: QueueName,
  receiptHandle: string,
  fn: () => Promise<T>,
  log?: (message: string) => void,
): Promise<T> {
  const heartbeat = startIntervalHeartbeat(
    () => extendMessageVisibility(name, receiptHandle),
    SQS_VISIBILITY_HEARTBEAT_MS,
    { log },
  );
  try {
    return await fn();
  } finally {
    heartbeat.stop();
  }
}
