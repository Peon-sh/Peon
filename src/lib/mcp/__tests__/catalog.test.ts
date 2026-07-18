import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { User } from '@/lib/prisma';
import { assembleAllTools } from '../catalog';
import { SECRET_WRITE_TOOLS, needsChatApproval } from '../catalog/classify';
import { toAiSdkTools } from '../adapters/ai-sdk';
import { createMcpAccess } from '../access';
import { registerAllTools } from '../register';

const user = { id: 'u1', email: 'a@b.com', name: 'A' } as User;
const ctx = { user, workspaceId: 'ws1' };

const LOOKAROUND = /\(\?[=!<]/;

describe('MCP catalog adapters', () => {
  it('MCP registration and AI SDK adapter share tool names', () => {
    const catalog = assembleAllTools(ctx);
    const names = catalog.map((t) => t.name).sort();

    const server = new McpServer({ name: 'peon-test', version: '0.0.0' });
    registerAllTools(server, ctx);
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    ).sort();

    for (const name of names) {
      expect(registered).toContain(name);
    }

    const aiTools = toAiSdkTools(catalog, ctx, createMcpAccess(ctx), { forChat: true });
    expect(Object.keys(aiTools).sort()).toEqual(names);
  });

  it('does not expose shell exec tools (use UI terminals instead)', () => {
    const names = assembleAllTools(ctx).map((t) => t.name);
    expect(names).not.toContain('exec_in_service');
    expect(names).not.toContain('exec_on_server');
  });

  it('classifies secret-write and mutating tools for approval', () => {
    const catalog = assembleAllTools(ctx);
    for (const name of SECRET_WRITE_TOOLS) {
      const toolDef = catalog.find((t) => t.name === name);
      expect(toolDef, name).toBeTruthy();
      expect(toolDef!.kind).toBe('secret-write');
      expect(needsChatApproval(toolDef!.kind)).toBe(true);
    }

    const deploy = catalog.find((t) => t.name === 'deploy_service');
    expect(deploy?.kind).toBe('mutating');
    expect(needsChatApproval(deploy!.kind)).toBe(true);

    const list = catalog.find((t) => t.name === 'list_services');
    expect(list?.kind).toBe('read');
    expect(needsChatApproval(list!.kind)).toBe(false);
  });

  it('tool JSON schemas have no regex lookaround (OpenAI rejects them)', () => {
    const catalog = assembleAllTools(ctx);
    const offenders: string[] = [];
    for (const toolDef of catalog) {
      const json = JSON.stringify(z.toJSONSchema(toolDef.inputSchema));
      if (LOOKAROUND.test(json)) {
        offenders.push(toolDef.name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
