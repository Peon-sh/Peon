/** Structured notification payload shared across channels. */
export type NotificationSeverity = 'success' | 'error' | 'warning' | 'info';

export interface NotificationField {
  label: string;
  value: string;
}

export interface NotificationLink {
  label: string;
  url: string;
}

export interface NotificationMessage {
  /** Short headline (also used as Slack fallback text / email subject). */
  subject: string;
  /** Plain body for channels that do not support rich formatting. */
  text: string;
  severity?: NotificationSeverity;
  fields?: NotificationField[];
  links?: NotificationLink[];
}

export const SEVERITY_EMOJI: Record<NotificationSeverity, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

export const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  success: '#2EB67D',
  error: '#E01E5A',
  warning: '#ECB22E',
  info: '#36C5F0',
};

/** Ensure a public app hostname is an absolute URL. */
export function absolutePublicUrl(fqdn: string | null | undefined): string | undefined {
  if (!fqdn) return undefined;
  const first = fqdn.split(',')[0]?.trim();
  if (!first) return undefined;
  if (/^https?:\/\//i.test(first)) return first;
  return `https://${first}`;
}

export function titledSubject(severity: NotificationSeverity | undefined, subject: string): string {
  if (!severity) return subject;
  return `${SEVERITY_EMOJI[severity]} ${subject}`;
}

/** Slack incoming-webhook body (Block Kit + colored attachment). */
export function buildSlackPayload(message: NotificationMessage): Record<string, unknown> {
  const severity = message.severity ?? 'info';
  const title = titledSubject(severity, message.subject);
  const lines: string[] = [message.text];

  if (message.fields?.length) {
    lines.push('');
    for (const field of message.fields) {
      const value =
        field.label === 'Error'
          ? `\`${field.value.replace(/`/g, "'")}\``
          : field.label === 'App' && !/^https?:\/\//i.test(field.value)
            ? `<https://${field.value}|${field.value}>`
            : field.label === 'App' && /^https?:\/\//i.test(field.value)
              ? `<${field.value}|${field.value.replace(/^https?:\/\//, '')}>`
              : field.value;
      lines.push(`*${field.label}:* ${value}`);
    }
  }

  if (message.links?.length) {
    lines.push('');
    lines.push(message.links.map((l) => `*<${l.url}|${l.label}>*`).join('   ·   '));
  }

  const description = lines.join('\n').trim();
  const httpsLinks = (message.links ?? []).filter((l) => l.url.startsWith('https://'));

  const attachmentBlocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: title.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: description.slice(0, 3000) },
    },
  ];

  if (httpsLinks.length) {
    attachmentBlocks.push({
      type: 'actions',
      elements: httpsLinks.slice(0, 5).map((l) => ({
        type: 'button',
        text: { type: 'plain_text', text: l.label.slice(0, 75), emoji: true },
        url: l.url,
      })),
    });
  }

  return {
    text: title,
    blocks: [
      {
        type: 'section',
        text: { type: 'plain_text', text: 'Peon notification', emoji: true },
      },
    ],
    attachments: [
      {
        color: SEVERITY_COLOR[severity],
        blocks: attachmentBlocks,
      },
    ],
  };
}

/** Discord webhook body with severity embed color. */
export function buildDiscordPayload(message: NotificationMessage): Record<string, unknown> {
  const severity = message.severity ?? 'info';
  const color = Number.parseInt(SEVERITY_COLOR[severity].slice(1), 16);
  const title = titledSubject(severity, message.subject);

  const embed: Record<string, unknown> = {
    title: title.slice(0, 256),
    description: message.text.slice(0, 4000),
    color,
    fields: (message.fields ?? []).slice(0, 25).map((f) => ({
      name: f.label.slice(0, 256),
      value: f.value.slice(0, 1024),
      inline: true,
    })),
  };

  if (message.links?.length) {
    const linkLine = message.links.map((l) => `[${l.label}](${l.url})`).join(' · ');
    embed.description = `${message.text}\n\n${linkLine}`.slice(0, 4000);
  }

  return {
    content: title,
    embeds: [embed],
  };
}
