import { serverEnv } from '@/lib/env';
import type { EmailDriver, EmailMessage } from '../types';

/**
 * Standard SMTP delivery. The default for self-hosted installations.
 *
 * Works with any normal provider — your own server, Resend, Postmark, Mailgun,
 * MXroute, Fastmail — so sending email requires no AWS account.
 *
 * `nodemailer` is imported lazily so installations on other drivers never load
 * it, and so this module stays importable when the dependency is absent.
 */

function defaultFromAddress(): string {
  const env = serverEnv();
  const name = env.EMAIL_FROM_NAME.trim();
  const email = env.EMAIL_FROM.trim();
  return name ? `${name} <${email}>` : email;
}

type Transporter = { sendMail(options: Record<string, unknown>): Promise<unknown> };

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;
  const env = serverEnv();

  if (!env.SMTP_HOST) {
    throw new Error('EMAIL_DRIVER=smtp requires SMTP_HOST (see .env.example).');
  }

  const nodemailer = await import('nodemailer');
  const port = env.SMTP_PORT;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587/25 start plaintext and upgrade via STARTTLS.
    secure: env.SMTP_SECURE ?? port === 465,
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } }
      : {}),
    ...(env.SMTP_TLS_REJECT_UNAUTHORIZED === false
      ? { tls: { rejectUnauthorized: false } }
      : {}),
  }) as unknown as Transporter;

  return transporter;
}

export class SmtpEmailDriver implements EmailDriver {
  async send(message: EmailMessage): Promise<void> {
    const transport = await getTransporter();
    await transport.sendMail({
      from: message.from ?? defaultFromAddress(),
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    });
  }
}

/** Reset the memoised transport (tests, config reload). */
export function resetSmtpTransport(): void {
  transporter = null;
}
