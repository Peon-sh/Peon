import { emailBodySection, emailCtaButton, wrapEmail } from './shell';
import { serverEnv } from '@/lib/env';

export function welcomeEmailTemplate(name?: string | null): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Welcome to Peon';
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi there,';
  const appUrl = serverEnv().APP_URL.replace(/\/$/, '');
  const body = emailBodySection(`
              <p style="font-size: 16px; line-height: 24px; color: #17211C; font-weight: 600; margin: 0 0 8px;">
                ${greeting}
              </p>
              <p style="font-size: 14px; line-height: 22px; color: #4A5568; margin: 0 0 12px;">
                Welcome to Peon — deploy apps and databases on your own servers with git-push deploys,
                custom domains, and automatic HTTPS.
              </p>
              <p style="font-size: 14px; line-height: 22px; color: #4A5568; margin: 0;">
                Create a project, connect a server, and ship your first service in minutes.
              </p>
              ${emailCtaButton(`${appUrl}/dashboard`, 'Open Peon')}
              <p style="font-size: 12px; line-height: 18px; color: #9AA3AF; margin: 24px 0 0;">
                If the button doesn&apos;t work, open
                <a href="${appUrl}/dashboard" style="color: #0C9268; text-decoration: underline;">${appUrl}/dashboard</a>
              </p>`);

  return {
    subject,
    html: wrapEmail(subject, body),
    text: `${greeting}\n\nWelcome to Peon. Open your dashboard: ${appUrl}/dashboard\n`,
  };
}
