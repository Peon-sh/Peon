import type { EmailDriver, EmailMessage } from '../types';

/** Logs emails to the console. Default for local development. */
export class TestEmailDriver implements EmailDriver {
  async send(message: EmailMessage): Promise<void> {
    console.log('\n===== [test email] =====');
    console.log('from:', message.from ?? '(default)');
    console.log('to:', message.to);
    console.log('subject:', message.subject);
    console.log('text:', message.text ?? message.html.replace(/<[^>]+>/g, ''));
    console.log('========================\n');
  }
}
