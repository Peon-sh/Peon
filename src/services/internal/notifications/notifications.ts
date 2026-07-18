import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { enqueueEmail } from '@/lib/email/enqueue';
import { notificationEmailTemplate } from '@/lib/email/templates/notification';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { NotificationChannelType } from '@/lib/prisma';
import type { UpsertChannelInput } from '@/schemas/notifications.schema';
import {
  buildDiscordPayload,
  buildSlackPayload,
  titledSubject,
  type NotificationMessage,
} from '@/services/internal/notifications/format';
import { AuditService } from '@/services/internal/audit/audit';

export const MASKED = '__MASKED__';

/** Canonical notification events (keys of the per-channel `events` matrix). */
export type NotificationEvent =
  | 'deployment_success'
  | 'deployment_failure'
  | 'server_unreachable'
  | 'backup_failure'
  // Kept for older callers / stored matrices; UI no longer exposes these.
  | 'deployment_started'
  | 'status_change'
  | 'backup_success'
  | 'task_success'
  | 'task_failure'
  | 'server_reachable'
  | 'high_disk_usage';

export type { NotificationMessage };

/** Secret keys inside `config` per channel that must be encrypted at rest. */
const SECRET_KEYS: Record<NotificationChannelType, string[]> = {
  // Email is sent via Peon EMAIL_DRIVER (SES/test) — no per-workspace SMTP secrets.
  EMAIL: [],
  DISCORD: ['webhookUrl'],
  SLACK: ['webhookUrl'],
  TELEGRAM: ['token'],
  PUSHOVER: ['token', 'user'],
  WEBHOOK: ['url', 'secret'],
};

type ConfigRecord = Record<string, string | number | boolean>;

function maskConfig(channel: NotificationChannelType, config: ConfigRecord): ConfigRecord {
  const secrets = SECRET_KEYS[channel];
  const out: ConfigRecord = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = secrets.includes(k) && v ? MASKED : v;
  }
  return out;
}

/** Merge incoming config with existing, encrypting new secrets and preserving masked ones. */
function prepareConfig(
  channel: NotificationChannelType,
  incoming: ConfigRecord,
  existing: ConfigRecord | null,
): ConfigRecord {
  const secrets = SECRET_KEYS[channel];
  const out: ConfigRecord = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (secrets.includes(k)) {
      if (v === MASKED) {
        if (existing && existing[k] !== undefined) out[k] = existing[k];
      } else if (typeof v === 'string' && v.length > 0) {
        out[k] = encrypt(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function decryptConfig(channel: NotificationChannelType, config: ConfigRecord): ConfigRecord {
  const secrets = SECRET_KEYS[channel];
  const out: ConfigRecord = { ...config };
  for (const k of secrets) {
    const v = config[k];
    if (typeof v === 'string' && v.length > 0) {
      try {
        out[k] = decrypt(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export const NotificationService = {
  async list(workspaceId: string) {
    const channels = await prisma.notificationChannel.findMany({
      where: { workspaceId },
    });
    return channels.map((c) => ({
      id: c.id,
      channel: c.channel,
      enabled: c.enabled,
      config: maskConfig(c.channel, (c.config as ConfigRecord) ?? {}),
      events: (c.events as Record<string, boolean>) ?? {},
    }));
  },

  async upsert(workspaceId: string, input: UpsertChannelInput) {
    const existing = await prisma.notificationChannel.findUnique({
      where: { workspaceId_channel: { workspaceId, channel: input.channel } },
    });
    const config = prepareConfig(
      input.channel,
      input.config as ConfigRecord,
      (existing?.config as ConfigRecord) ?? null,
    );
    const saved = await prisma.notificationChannel.upsert({
      where: { workspaceId_channel: { workspaceId, channel: input.channel } },
      create: {
        workspaceId,
        channel: input.channel,
        enabled: input.enabled,
        config,
        events: input.events,
      },
      update: {
        enabled: input.enabled,
        config,
        events: input.events,
      },
    });
    await AuditService.record({
      workspaceId,
      action: 'notification.upserted',
      resourceType: 'notification',
      resourceId: saved.id,
      resourceName: saved.channel,
      summary: `Upserted notification channel ${saved.channel}`,
      metadata: { channel: saved.channel, enabled: saved.enabled },
    });
    return {
      id: saved.id,
      channel: saved.channel,
      enabled: saved.enabled,
      config: maskConfig(saved.channel, (saved.config as ConfigRecord) ?? {}),
      events: (saved.events as Record<string, boolean>) ?? {},
    };
  },

  /** Best-effort test message for a channel. */
  async test(workspaceId: string, channel: NotificationChannelType) {
    const row = await prisma.notificationChannel.findUnique({
      where: { workspaceId_channel: { workspaceId, channel } },
    });
    if (!row) throw new NotFoundError('Channel is not configured.');
    const config = decryptConfig(channel, (row.config as ConfigRecord) ?? {});
    await sendToChannel(channel, config, {
      subject: 'Peon test notification',
      text: 'Peon test notification. If you received this, your channel works!',
      severity: 'info',
    });
    await AuditService.record({
      workspaceId,
      action: 'notification.tested',
      resourceType: 'notification',
      resourceId: row.id,
      resourceName: channel,
      summary: `Tested notification channel ${channel}`,
      metadata: { channel },
    });
    return { sent: true };
  },

  /**
   * Fire a notification to every enabled channel in the workspace that has the
   * given event toggled on. Best-effort: individual channel failures are logged
   * and swallowed so a broken channel never blocks a deploy/backup/task.
   */
  async dispatch(workspaceId: string, event: NotificationEvent, message: NotificationMessage) {
    const channels = await prisma.notificationChannel.findMany({
      where: { workspaceId, enabled: true },
    });
    await Promise.all(
      channels.map(async (row) => {
        const events = (row.events as Record<string, boolean>) ?? {};
        if (!events[event]) return;
        try {
          const config = decryptConfig(row.channel, (row.config as ConfigRecord) ?? {});
          await sendToChannel(row.channel, config, message);
        } catch (err) {
          console.error(
            `[notifications] ${row.channel} dispatch for ${event} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );
  },
};

/** Flatten a rich notification for plain-text channels. */
function plainBody(message: NotificationMessage): string {
  const lines = [message.text];
  if (message.fields?.length) {
    lines.push('');
    for (const field of message.fields) {
      lines.push(`${field.label}: ${field.value}`);
    }
  }
  if (message.links?.length) {
    lines.push('');
    for (const link of message.links) {
      lines.push(`${link.label}: ${link.url}`);
    }
  }
  return lines.join('\n').trim();
}

/** Deliver a message to a single channel using its decrypted config. */
async function sendToChannel(
  channel: NotificationChannelType,
  config: ConfigRecord,
  message: NotificationMessage,
) {
  const title = titledSubject(message.severity, message.subject);
  const body = plainBody(message);

  switch (channel) {
    case 'EMAIL': {
      const to = String(config.to ?? config.recipients ?? '');
      if (!to) throw new ValidationError('No recipient email configured.');
      const email = notificationEmailTemplate(message);
      await enqueueEmail({ to, subject: email.subject, html: email.html, text: email.text });
      return;
    }
    case 'DISCORD': {
      const url = String(config.webhookUrl ?? '');
      if (!url) throw new ValidationError('No Discord webhook URL configured.');
      await postJson(url, buildDiscordPayload(message));
      return;
    }
    case 'SLACK': {
      const url = String(config.webhookUrl ?? '');
      if (!url) throw new ValidationError('No Slack webhook URL configured.');
      await postJson(url, buildSlackPayload(message));
      return;
    }
    case 'TELEGRAM': {
      const token = String(config.token ?? '');
      const chatId = String(config.chatId ?? '');
      if (!token || !chatId) throw new ValidationError('Telegram token and chatId are required.');
      await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: `${title}\n${body}`,
        disable_web_page_preview: false,
      });
      return;
    }
    case 'PUSHOVER': {
      const token = String(config.token ?? '');
      const user = String(config.user ?? '');
      if (!token || !user) throw new ValidationError('Pushover token and user are required.');
      await postJson('https://api.pushover.net/1/messages.json', {
        token,
        user,
        title,
        message: body,
      });
      return;
    }
    case 'WEBHOOK': {
      const url = String(config.url ?? '');
      if (!url) throw new ValidationError('No webhook URL configured.');
      await postJson(url, {
        event: message.subject,
        message: body,
        severity: message.severity ?? 'info',
        fields: message.fields ?? [],
        links: message.links ?? [],
      });
      return;
    }
    default:
      throw new ValidationError('Unsupported channel.');
  }
}

async function postJson(url: string, body: unknown) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
