import { emailBodySection, emailCtaButton, wrapEmail } from './shell';

export type NotificationEmailSeverity = 'success' | 'error' | 'warning' | 'info';

export interface NotificationEmailInput {
  subject: string;
  text: string;
  severity?: NotificationEmailSeverity;
  fields?: { label: string; value: string }[];
  links?: { label: string; url: string }[];
}

const SEVERITY_EMOJI: Record<NotificationEmailSeverity, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

const SEVERITY_LABEL: Record<NotificationEmailSeverity, string> = {
  success: 'Success',
  error: 'Failed',
  warning: 'Warning',
  info: 'Notice',
};

const SEVERITY_PILL: Record<NotificationEmailSeverity, { bg: string; fg: string }> = {
  success: { bg: '#E8F8F1', fg: '#0C9268' },
  error: { bg: '#FDECEE', fg: '#C62828' },
  warning: { bg: '#FFF6E5', fg: '#B7791F' },
  info: { bg: '#E8F4FC', fg: '#1565C0' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Transactional email for workspace event notifications (deploy, backup, …). */
export function notificationEmailTemplate(message: NotificationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const severity = message.severity ?? 'info';
  const subject = `${SEVERITY_EMOJI[severity]} ${message.subject}`;
  const pill = SEVERITY_PILL[severity];
  const primary = message.links?.[0];
  const extraLinks = message.links?.slice(1) ?? [];

  const fieldsHtml = message.fields?.length
    ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px; border: 1px solid #E8EAED; border-radius: 8px; overflow: hidden;">
                ${message.fields
                  .map(
                    (f, i) => `
                <tr>
                  <td style="padding: 10px 14px; font-size: 12px; color: #9AA3AF; width: 28%; background: ${i % 2 === 0 ? '#F8F9FA' : '#FFFFFF'}; border-bottom: 1px solid #E8EAED; vertical-align: top;">
                    ${escapeHtml(f.label)}
                  </td>
                  <td style="padding: 10px 14px; font-size: 13px; color: #17211C; background: ${i % 2 === 0 ? '#F8F9FA' : '#FFFFFF'}; border-bottom: 1px solid #E8EAED; word-break: break-word;">
                    ${escapeHtml(f.value)}
                  </td>
                </tr>`,
                  )
                  .join('')}
              </table>`
    : '';

  const extraLinksHtml = extraLinks.length
    ? `
              <p style="font-size: 12px; line-height: 18px; color: #9AA3AF; margin: 20px 0 0;">
                ${extraLinks
                  .map(
                    (l) =>
                      `<a href="${escapeHtml(l.url)}" style="color: #0C9268; text-decoration: underline;">${escapeHtml(l.label)}</a>`,
                  )
                  .join('&nbsp;&nbsp;·&nbsp;&nbsp;')}
              </p>`
    : '';

  const body = emailBodySection(`
              <span style="display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; background: ${pill.bg}; color: ${pill.fg}; margin: 0 0 12px;">
                ${SEVERITY_LABEL[severity]}
              </span>
              <p style="font-size: 16px; line-height: 24px; color: #17211C; font-weight: 600; margin: 0 0 8px;">
                ${escapeHtml(message.subject)}
              </p>
              <p style="font-size: 14px; line-height: 22px; color: #4A5568; margin: 0;">
                ${escapeHtml(message.text)}
              </p>
              ${fieldsHtml}
              ${primary ? emailCtaButton(primary.url, primary.label) : ''}
              ${
                primary
                  ? `<p style="font-size: 12px; line-height: 18px; color: #9AA3AF; margin: 24px 0 0;">
                Or open this link:
                <a href="${escapeHtml(primary.url)}" style="color: #0C9268; text-decoration: underline;">${escapeHtml(primary.url)}</a>
              </p>`
                  : ''
              }
              ${extraLinksHtml}`);

  const textLines = [
    subject,
    '',
    message.text,
    ...(message.fields ?? []).map((f) => `${f.label}: ${f.value}`),
    '',
    ...(message.links ?? []).map((l) => `${l.label}: ${l.url}`),
  ];

  return {
    subject,
    html: wrapEmail(subject, body),
    text: `${textLines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')}\n`,
  };
}
