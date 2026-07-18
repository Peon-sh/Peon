import { emailBodySection, emailCtaButton, wrapEmail } from './shell';

export function invitationEmailTemplate(input: {
  kind: 'workspace' | 'project';
  url: string;
}): { subject: string; html: string; text: string } {
  const label = input.kind === 'workspace' ? 'workspace' : 'project';
  const subject = `You've been invited to a ${label} on Peon`;
  const body = emailBodySection(`
              <p style="font-size: 16px; line-height: 24px; color: #17211C; font-weight: 600; margin: 0 0 8px;">
                You&apos;re invited
              </p>
              <p style="font-size: 14px; line-height: 22px; color: #4A5568; margin: 0;">
                You&apos;ve been invited to collaborate on a ${label} in Peon.
                Accept the invitation to get started.
              </p>
              ${emailCtaButton(input.url, 'Accept invitation')}
              <p style="font-size: 12px; line-height: 18px; color: #9AA3AF; margin: 24px 0 0;">
                Or open this link:
                <a href="${input.url}" style="color: #0C9268; text-decoration: underline;">${input.url}</a>
              </p>`);

  return {
    subject,
    html: wrapEmail(subject, body),
    text: `You've been invited to a ${label} on Peon.\nAccept: ${input.url}\n`,
  };
}
