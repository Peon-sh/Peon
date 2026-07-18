import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs';
import { serverEnv } from '@/lib/env';
import { isE2eMode } from '@/lib/e2e';
import { awsCredentialsIfConfigured, awsRegion } from '@/lib/aws/credentials';
import { type QueueMessage, type QueueName, queueForMessage } from './messages';

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
      VisibilityTimeout: 900,
    }),
  );
  return res.Messages ?? [];
}

export async function deleteMessage(name: QueueName, receiptHandle: string): Promise<void> {
  await getClient().send(
    new DeleteMessageCommand({ QueueUrl: queueUrl(name), ReceiptHandle: receiptHandle }),
  );
}
