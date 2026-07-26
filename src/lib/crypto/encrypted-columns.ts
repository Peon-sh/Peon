/**
 * Every column encrypted at the application layer with `lib/crypto/encryption`.
 *
 * Single source of truth for key rotation. **When you add an encrypted column,
 * add it here** — a value missing from this list silently survives a key
 * rotation still encrypted under the old key, and becomes unreadable the moment
 * `ENCRYPTION_KEY_PREVIOUS` is removed.
 *
 * `model` is the Prisma client accessor (camelCase), not the schema model name.
 *
 * `NotificationChannel.config` is deliberately absent: it is a JSON blob whose
 * individual values are encrypted, so it needs bespoke handling in the rotation
 * script rather than a column rewrite.
 */
export interface EncryptedTarget {
  model: string;
  columns: string[];
}

export const ENCRYPTED_TARGETS: EncryptedTarget[] = [
  { model: 'privateKey', columns: ['privateKey'] },
  { model: 'githubApp', columns: ['clientSecret', 'webhookSecret'] },
  { model: 'gitlabApp', columns: ['appSecret', 'webhookToken'] },
  { model: 'service', columns: ['dbPassword', 'dbRootPassword'] },
  { model: 'environmentVariable', columns: ['value'] },
  { model: 'sharedEnvironmentVariable', columns: ['value'] },
  { model: 's3Storage', columns: ['accessKey', 'secretKey'] },
  { model: 'serverSetting', columns: ['sentinelToken'] },
  { model: 'cloudProviderToken', columns: ['token'] },
  { model: 'sslCertificate', columns: ['privateKey'] },
  { model: 'oauthSetting', columns: ['clientSecret'] },
  { model: 'workspaceLlmCredential', columns: ['apiKey'] },
];

/** JSON columns whose individual string values are encrypted. */
export const ENCRYPTED_JSON_TARGETS: EncryptedTarget[] = [
  { model: 'notificationChannel', columns: ['config'] },
];
