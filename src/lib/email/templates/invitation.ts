import { emailBodySection, emailCtaButton, wrapEmail } from './shell';

export function invitationEmailTemplate(input: {
  kind: 'workspace' | 'project';
  url: string;
}): { subject: string; html: string; text: string } {
  const label = input.kind === 'workspace' ? 'workspace' : 'project';
  const subject = `You've been invited to a ${label} on Peon`;
  const body = emailBodySection(`
              <p style="font-size: 16px; line-height: 24px; color: #171717; font-weight: 600; margin: 0 0 8px;">
                You&apos;re invited
              </p>
              <p style="font-size: 14px; line-height: 22px; color: #404040; margin: 0;">
                You&apos;ve been invited to collaborate on a ${label} in Peon.
                Accept the invitation to get started.
              </p>
              ${emailCtaButton(input.url, 'Accept invitation')}
              <p style="font-size: 12px; line-height: 18px; color: #8A8A8A; margin: 24px 0 0;">
                Or open this link:
                <a href="${input.url}" style="color: #5E6AD2; text-decoration: underline;">${input.url}</a>
              </p>`);

  return {
    subject,
    html: wrapEmail(subject, body),
    text: `You've been invited to a ${label} on Peon.\nAccept: ${input.url}\n`,
  };
}
