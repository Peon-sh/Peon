import { emailBodySection, wrapEmail } from './shell';

export function otpEmailTemplate(
  code: string,
  purpose: string,
): { subject: string; html: string; text: string } {
  const action =
    purpose === 'RESET_PASSWORD' ? 'reset your password' : 'verify your email address';
  const subject = `Your Peon verification code: ${code}`;
  const body = emailBodySection(`
              <p style="font-size: 16px; line-height: 24px; color: #171717; font-weight: 600; margin: 0 0 8px;">
                Verification code
              </p>
              <p style="font-size: 14px; line-height: 22px; color: #404040; margin: 0 0 24px;">
                Use the code below to ${action}.
              </p>
              <div class="otp" style="font-size: 32px; font-weight: 700; letter-spacing: 10px; background: #FAFAFA; padding: 18px 16px; text-align: center; border-radius: 8px; color: #171717; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
                ${code}
              </div>
              <p style="font-size: 12px; line-height: 18px; color: #8A8A8A; margin: 20px 0 0;">
                This code expires in 10 minutes. If you didn&apos;t request it, you can ignore this email.
              </p>`);

  return {
    subject,
    html: wrapEmail(subject, body),
    text: `Use this code to ${action}: ${code}\nThis code expires in 10 minutes.`,
  };
}
