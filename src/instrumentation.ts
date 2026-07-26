/**
 * Next.js startup hook. Runs once per server process, before any request.
 *
 * Used for startup preflight that needs I/O and therefore cannot live in the
 * synchronous env schema.
 */
export async function register(): Promise<void> {
  // Only the Node.js server runtime has a database or node:crypto.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertEncryptionKeyUsable } = await import('@/lib/crypto/preflight');
  await assertEncryptionKeyUsable();
}
