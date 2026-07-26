import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { issueSetupToken } from '../src/services/internal/instance/setup-token';

/**
 * Print a one-time setup link for the first administrator.
 *
 * Called by install.sh after the stack is healthy. Safe to run again: it is a
 * no-op once any user exists, so it cannot be used to mint an extra admin on a
 * live instance.
 */
async function main(): Promise<void> {
  const issued = await issueSetupToken();

  if (!issued) {
    console.log('');
    console.log('  An administrator already exists — no setup link needed.');
    console.log('  Sign in normally, or use "Forgot password" if you are locked out.');
    console.log('');
    return;
  }

  console.log('');
  console.log('  ┌────────────────────────────────────────────────────────────────┐');
  console.log('  │  CREATE YOUR ADMINISTRATOR ACCOUNT                             │');
  console.log('  └────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`  ${issued.url}`);
  console.log('');
  console.log(`  Single use. Expires ${issued.expiresAt.toISOString()}.`);
  console.log('  This link is shown once and is not recoverable — the database');
  console.log('  stores only a hash. Re-run this command to issue a new one.');
  console.log('');
}

main()
  .catch((err) => {
    console.error('Failed to create the setup link:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
