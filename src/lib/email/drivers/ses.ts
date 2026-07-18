import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailDriver, EmailMessage } from '../types';
import { serverEnv } from '@/lib/env';
import { awsCredentialsIfConfigured, awsRegion } from '@/lib/aws/credentials';

function defaultFromAddress(): string {
  const env = serverEnv();
  const name = env.EMAIL_FROM_NAME.trim();
  const email = env.EMAIL_FROM.trim();
  return name ? `${name} <${email}>` : email;
}

export class SesEmailDriver implements EmailDriver {
  private client: SESClient;

  constructor() {
    const credentials = awsCredentialsIfConfigured();
    this.client = new SESClient({
      region: awsRegion(),
      ...(credentials ? { credentials } : {}),
    });
  }

  async send(message: EmailMessage): Promise<void> {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    await this.client.send(
      new SendEmailCommand({
        Source: message.from ?? defaultFromAddress(),
        Destination: { ToAddresses: to },
        Message: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: message.html, Charset: 'UTF-8' },
            ...(message.text
              ? { Text: { Data: message.text, Charset: 'UTF-8' } }
              : {}),
          },
        },
      }),
    );
  }
}
