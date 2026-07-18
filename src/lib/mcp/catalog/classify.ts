import type { ToolKind } from '@/lib/mcp/catalog/types';

export const SECRET_WRITE_TOOLS = new Set([
  'set_env',
  'bulk_set_env',
  'update_service_config',
  'create_storage',
  'update_storage',
  'create_private_key',
]);

export function isMutatingKind(kind: ToolKind): boolean {
  return kind !== 'read';
}

export function needsChatApproval(kind: ToolKind): boolean {
  return kind !== 'read';
}
