import { serverEnv } from '@/lib/env';
import type { EmailDriver, EmailMessage } from './types';
import { TestEmailDriver } from './drivers/test';
import { SesEmailDriver } from './drivers/ses';

let driver: EmailDriver | null = null;

export function getEmailDriver(): EmailDriver {
  if (driver) return driver;
  switch (serverEnv().EMAIL_DRIVER) {
    case 'aws-ses':
      driver = new SesEmailDriver();
      break;
    default:
      driver = new TestEmailDriver();
  }
  return driver;
}

/** Send immediately via the configured driver (used by the worker). */
export function sendEmail(message: EmailMessage): Promise<void> {
  return getEmailDriver().send(message);
}
