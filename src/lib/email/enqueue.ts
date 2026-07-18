import { enqueue } from '@/lib/queue/sqs';
import type { EmailMessage } from '@/lib/email/types';

/** Queue an email for the worker to deliver via the configured driver. */
export async function enqueueEmail(
  message: Pick<EmailMessage, 'to' | 'subject' | 'html' | 'text' | 'from'>,
): Promise<void> {
  const to = Array.isArray(message.to) ? message.to : [message.to];
  await enqueue({
    type: 'email.send',
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    from: message.from,
  });
}
