import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { User } from '@/lib/prisma';
import { registerAllTools } from '../register';

const REQUIRED_TOOLS = [
  'get_context',
  'list_projects',
  'create_project',
  'get_project',
  'update_project',
  'delete_project',
  'list_services',
  'create_service',
  'update_service',
  'delete_service',
  'deploy_service',
  'rollback_service',
  'list_env',
  'set_env',
  'delete_env',
  'bulk_set_env',
  'list_volumes',
  'list_tasks',
  'list_backups',
  'restore_backup',
  'list_webhooks',
  'list_previews',
  'list_templates',
  'list_servers',
  'create_server',
  'validate_server',
  'list_destinations',
  'list_sources',
  'list_github_repos',
  'get_github_connect_url',
  'list_private_keys',
  'list_storages',
  'list_tags',
  'list_shared_variables',
  'list_notifications',
  'list_workspace_members',
  'invite_workspace_member',
  'transfer_workspace_ownership',
  'leave_workspace',
  'list_project_members',
  'list_active_deployments',
] as const;

describe('registerAllTools', () => {
  it('registers the full agent-valuable tool surface', () => {
    const server = new McpServer({ name: 'peon-test', version: '0.0.0' });
    registerAllTools(server, {
      user: { id: 'u1', email: 'a@b.com', name: 'A' } as User,
      workspaceId: 'ws1',
    });

    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    const names = Object.keys(registered);

    for (const name of REQUIRED_TOOLS) {
      expect(names, `missing tool ${name}`).toContain(name);
    }
    expect(names.length).toBeGreaterThanOrEqual(REQUIRED_TOOLS.length);
  });
});
