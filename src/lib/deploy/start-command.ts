/**
 * Compose string commands become a one-element argv (for Nixpacks `bash -c`).
 * For Dockerfile.worker the image already defines the correct CMD; overriding
 * with a bare `pnpm worker|schedule|socket` becomes `node "pnpm …"` via the
 * node image entrypoint and crash-loops. Skip that redundant override.
 */
export function resolveComposeStartCommand(
  startCommand: string | null | undefined,
  dockerfilePath: string | null | undefined,
): string | undefined {
  const raw = startCommand?.trim();
  if (!raw) return undefined;
  const df = (dockerfilePath || '').toLowerCase();
  if (
    df.includes('dockerfile.worker') &&
    /^(pnpm|npm|yarn|bun)\s+(worker|schedule|socket)$/.test(raw)
  ) {
    return undefined;
  }
  return raw;
}
