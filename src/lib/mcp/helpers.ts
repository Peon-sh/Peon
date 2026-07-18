import type { User } from '@/lib/prisma';

/**
 * Shared MCP helpers. Tools call the internal service layer directly with the
 * user/workspace resolved from the API token.
 */

export interface McpContext {
  user: User;
  workspaceId: string;
}

export function json(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(e: unknown) {
  return {
    content: [
      { type: 'text' as const, text: e instanceof Error ? e.message : 'Unknown error' },
    ],
    isError: true,
  };
}

/** Wrap a tool handler so service-layer errors become MCP error results. */
export function safe<A>(fn: (args: A) => Promise<{ content: { type: 'text'; text: string }[] }>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return errorResult(e);
    }
  };
}
