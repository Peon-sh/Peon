import { serverEnv } from '@/lib/env';
import type { EmailDriver, EmailMessage } from './types';
import { TestEmailDriver } from './drivers/test';

let driver: EmailDriver | null = null;
let loading: Promise<EmailDriver> | null = null;

/**
 * Resolve the configured email driver.
 *
 * Async so `aws-ses` never loads the AWS SDK and `smtp` never loads nodemailer
 * unless selected. `test` is synchronous and needs neither.
 */
export function getEmailDriver(): Promise<EmailDriver> {
  if (driver) return Promise.resolve(driver);
  if (loading) return loading;

  loading = (async () => {
    switch (serverEnv().EMAIL_DRIVER) {
      case 'aws-ses': {
        const { SesEmailDriver } = await import('./drivers/ses');
        driver = new SesEmailDriver();
        break;
      }
      case 'smtp': {
        const { SmtpEmailDriver } = await import('./drivers/smtp');
        driver = new SmtpEmailDriver();
        break;
      }
      default:
        driver = new TestEmailDriver();
    }
    return driver;
  })();

  return loading;
}

/** Replace or clear the driver (tests). */
export function setEmailDriver(next: EmailDriver | null): void {
  driver = next;
  loading = null;
}

/** Send immediately via the configured driver (used by the worker). */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const d = await getEmailDriver();
  await d.send(message);
}
