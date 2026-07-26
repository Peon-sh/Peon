import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import {
  encrypt,
  decryptWithSource,
  encryptionKeyStatus,
  isValidEncryptionKey,
} from '../src/lib/crypto/encryption';
import { ENCRYPTED_TARGETS, type EncryptedTarget } from '../src/lib/crypto/encrypted-columns';

/**
 * Re-encrypt every app-layer secret under the current ENCRYPTION_KEY.
 *
 *   ENCRYPTION_KEY_PREVIOUS=<old>  ENCRYPTION_KEY=<new>  pnpm encryption:rotate
 *
 * Rows already readable with the current key are left alone, so the script is
 * idempotent and safe to re-run after an interruption. Pass `--dry-run` to
 * report what would change without writing.
 */

const dryRun = process.argv.includes('--dry-run');

type Counts = { scanned: number; rotated: number; alreadyCurrent: number; failed: number };

function emptyCounts(): Counts {
  return { scanned: 0, rotated: 0, alreadyCurrent: 0, failed: 0 };
}

function add(a: Counts, b: Counts): Counts {
  return {
    scanned: a.scanned + b.scanned,
    rotated: a.rotated + b.rotated,
    alreadyCurrent: a.alreadyCurrent + b.alreadyCurrent,
    failed: a.failed + b.failed,
  };
}

/** Rotate one plain string column. */
async function rotateColumn(target: EncryptedTarget): Promise<Counts> {
  const counts = emptyCounts();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[target.model];
  if (!model) {
    console.warn(`  ! unknown model ${target.model}, skipping`);
    return counts;
  }

  const rows: Array<Record<string, unknown>> = await model.findMany({
    select: { id: true, ...Object.fromEntries(target.columns.map((c) => [c, true])) },
  });

  for (const row of rows) {
    const data: Record<string, string> = {};
    for (const column of target.columns) {
      const value = row[column];
      if (typeof value !== 'string' || !value) continue;
      counts.scanned++;
      try {
        const { value: plaintext, source } = decryptWithSource(value);
        if (source === 'current') {
          counts.alreadyCurrent++;
          continue;
        }
        data[column] = encrypt(plaintext);
        counts.rotated++;
      } catch {
        counts.failed++;
        console.error(
          `  ! ${target.model}.${column} id=${String(row.id)} — undecryptable with either key`,
        );
      }
    }
    if (Object.keys(data).length && !dryRun) {
      await model.update({ where: { id: row.id as string }, data });
    }
  }
  return counts;
}

/**
 * NotificationChannel.config is a JSON object whose *values* are individually
 * encrypted (see services/internal/notifications/notifications.ts), so it needs
 * per-key handling rather than a column rewrite.
 */
async function rotateNotificationChannels(): Promise<Counts> {
  const counts = emptyCounts();
  const rows = await prisma.notificationChannel.findMany({ select: { id: true, config: true } });

  for (const row of rows) {
    const config = row.config as Record<string, unknown> | null;
    if (!config || typeof config !== 'object') continue;

    const next: Record<string, unknown> = { ...config };
    let changed = false;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'string' || !value) continue;
      // Only three-segment payloads are ours; plain settings pass through.
      const parts = value.split('.');
      if (parts.length !== 3 || !parts[0] || !parts[1]) continue;
      counts.scanned++;
      try {
        const { value: plaintext, source } = decryptWithSource(value);
        if (source === 'current') {
          counts.alreadyCurrent++;
          continue;
        }
        next[key] = encrypt(plaintext);
        changed = true;
        counts.rotated++;
      } catch {
        counts.failed++;
        console.error(`  ! NotificationChannel.config.${key} id=${row.id} — undecryptable`);
      }
    }

    if (changed && !dryRun) {
      await prisma.notificationChannel.update({
        where: { id: row.id },
        data: { config: next as never },
      });
    }
  }
  return counts;
}

async function main(): Promise<void> {
  const status = encryptionKeyStatus();

  console.log('Peon encryption key rotation');
  console.log(`  current key mode : ${status.mode}`);
  console.log(`  previous key set : ${status.hasPreviousKey ? 'yes' : 'no'}`);
  console.log(`  mode             : ${dryRun ? 'DRY RUN (no writes)' : 'WRITING'}`);
  console.log('');

  if (!status.hasPreviousKey) {
    console.log(
      'ENCRYPTION_KEY_PREVIOUS is not set. Nothing can be re-keyed — this run will only\n' +
        'verify that every stored secret is readable with the current key.\n',
    );
  }
  if (!isValidEncryptionKey(process.env.ENCRYPTION_KEY)) {
    console.warn(
      'WARNING: the CURRENT ENCRYPTION_KEY is not a 32-byte base64 value, so rotation\n' +
        'would re-encrypt into legacy derived mode. Generate a proper key first:\n' +
        '  openssl rand -base64 32\n',
    );
  }

  let total = emptyCounts();
  for (const target of ENCRYPTED_TARGETS) {
    process.stdout.write(`  ${target.model}.${target.columns.join(',')} … `);
    const counts = await rotateColumn(target);
    total = add(total, counts);
    console.log(
      `scanned=${counts.scanned} rotated=${counts.rotated} current=${counts.alreadyCurrent} failed=${counts.failed}`,
    );
  }

  process.stdout.write('  NotificationChannel.config (json) … ');
  const notif = await rotateNotificationChannels();
  total = add(total, notif);
  console.log(
    `scanned=${notif.scanned} rotated=${notif.rotated} current=${notif.alreadyCurrent} failed=${notif.failed}`,
  );

  console.log('');
  console.log(`  scanned          : ${total.scanned}`);
  console.log(`  rotated          : ${total.rotated}`);
  console.log(`  already current  : ${total.alreadyCurrent}`);
  console.log(`  failed           : ${total.failed}`);
  console.log('');

  if (total.failed > 0) {
    console.error(
      'Some values could not be decrypted with either key. Do NOT remove\n' +
        'ENCRYPTION_KEY_PREVIOUS. Investigate before continuing.',
    );
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to write.');
    return;
  }
  console.log(
    total.rotated === 0 && status.hasPreviousKey
      ? 'Everything is already on the current key — you can now remove ENCRYPTION_KEY_PREVIOUS.'
      : 'Rotation complete. Re-run to confirm 0 rotated, then remove ENCRYPTION_KEY_PREVIOUS.',
  );
}

main()
  .catch((err) => {
    console.error('Rotation failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
