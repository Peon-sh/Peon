import { encryptionKeyStatus, ENCRYPTION_KEY_HINT } from '@/lib/crypto/encryption';

/**
 * Encryption-key policy.
 *
 * The rule we want is "new installations must use a proper 32-byte key, existing
 * ones must keep working". That distinction cannot be made where it would be
 * most convenient:
 *
 * - `lib/env.ts` parses `process.env` synchronously with no database access.
 * - `lib/crypto/encryption.ts` must stay usable from scripts and tests.
 *
 * It needs one fact from the database — does this installation already hold
 * data? — so the check lives here and is async, and is called from process
 * startup rather than from module import.
 *
 * Outcomes:
 *
 * | Key         | Fresh database   | Existing database        |
 * |-------------|------------------|--------------------------|
 * | strict      | ok               | ok                       |
 * | placeholder | **refuse**       | warn loudly              |
 * | legacy      | **refuse**       | warn loudly (deprecated) |
 *
 * "Existing" wins ties: if the database cannot be reached or the schema is not
 * migrated yet, we warn instead of refusing. A monitoring blip must never stop
 * a running installation from booting.
 */

export type EncryptionPreflightOutcome =
  | { ok: true; level: 'ok' }
  | { ok: true; level: 'warn'; message: string }
  | { ok: false; level: 'error'; message: string };

const ROTATE_DOC = 'docs/self-hosting.md#rotating-the-encryption-key';

function legacyBanner(reason: string): string {
  return [
    '',
    '  ┌──────────────────────────────────────────────────────────────────────┐',
    '  │  DEPRECATED ENCRYPTION KEY                                           │',
    '  └──────────────────────────────────────────────────────────────────────┘',
    `  ${reason}`,
    '',
    '  Your existing encrypted data (SSH keys, database passwords, environment',
    '  variables, LLM credentials) is readable and Peon will keep working.',
    '',
    `  ${ENCRYPTION_KEY_HINT}`,
    '',
    '  To move to a proper key WITHOUT losing data:',
    '    1. ENCRYPTION_KEY_PREVIOUS=<your current ENCRYPTION_KEY>',
    '    2. ENCRYPTION_KEY=$(openssl rand -base64 32)',
    '    3. pnpm encryption:rotate',
    '    4. remove ENCRYPTION_KEY_PREVIOUS once it reports 0 rows remaining',
    '',
    `  Details: ${ROTATE_DOC}`,
    '',
  ].join('\n');
}

function freshInstallError(reason: string): string {
  return [
    '',
    'Refusing to start: this looks like a NEW installation with an invalid ENCRYPTION_KEY.',
    `  ${reason}`,
    '',
    `  ${ENCRYPTION_KEY_HINT}`,
    '',
    '  Set it once, before creating any data. Changing it later makes every',
    '  stored secret unreadable unless you rotate (see docs).',
    '',
    '  If this is NOT a new installation — if you already have data encrypted',
    '  under this key — the database is unreachable or unmigrated. Fix the',
    '  database connection and start again; Peon will then keep your key and',
    '  warn instead of refusing.',
    '',
  ].join('\n');
}

/**
 * Decide whether the configured key is acceptable.
 *
 * `countUsers` is injected so this is testable without a database and so the
 * caller controls which Prisma client is used.
 */
export async function checkEncryptionKey(
  countUsers: () => Promise<number>,
): Promise<EncryptionPreflightOutcome> {
  const status = encryptionKeyStatus();

  if (status.mode === 'strict' && !status.isPlaceholder) {
    return { ok: true, level: 'ok' };
  }

  const reason = status.isPlaceholder
    ? 'ENCRYPTION_KEY is still the placeholder value from .env.example.'
    : 'ENCRYPTION_KEY is not a 32-byte base64 value, so it is being SHA-256 derived (legacy mode).';

  let isFreshInstall: boolean;
  try {
    isFreshInstall = (await countUsers()) === 0;
  } catch {
    // Unreachable or unmigrated database: assume an existing installation.
    // Refusing here would brick an upgrade over a transient database problem.
    return { ok: true, level: 'warn', message: legacyBanner(reason) };
  }

  if (isFreshInstall) {
    return { ok: false, level: 'error', message: freshInstallError(reason) };
  }
  return { ok: true, level: 'warn', message: legacyBanner(reason) };
}

/**
 * Startup guard. Warns for legacy keys on existing installations, throws only
 * when the installation is provably new.
 */
export async function assertEncryptionKeyUsable(
  countUsers?: () => Promise<number>,
): Promise<void> {
  const count =
    countUsers ??
    (async () => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.user.count();
    });

  const outcome = await checkEncryptionKey(count);
  if (outcome.level === 'warn') console.warn(outcome.message);
  if (!outcome.ok) throw new Error(outcome.message);
}
