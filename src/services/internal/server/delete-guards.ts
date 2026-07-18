/**
 * Preflight for server deletion (name confirm + resource gate).
 */
export type ServerDeleteGuardResult =
  | { ok: true }
  | { ok: false; reason: 'name_mismatch' | 'has_resources'; message: string };

export function checkServerDelete(input: {
  serverName: string;
  confirmName: string;
  resourceCount: number;
  deleteResources: boolean;
}): ServerDeleteGuardResult {
  if (input.confirmName.trim() !== input.serverName) {
    return {
      ok: false,
      reason: 'name_mismatch',
      message: 'Type the exact server name to confirm deletion.',
    };
  }

  if (input.resourceCount > 0 && !input.deleteResources) {
    const n = input.resourceCount;
    return {
      ok: false,
      reason: 'has_resources',
      message: `Server has ${n} resource${n === 1 ? '' : 's'}. Delete them first or select "Delete all resources".`,
    };
  }

  return { ok: true };
}
