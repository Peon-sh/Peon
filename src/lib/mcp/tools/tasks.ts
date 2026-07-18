import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceModule } from '@/services/internal/service/service';
import { upsertTaskSchema } from '@/schemas/service.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerTaskTools(server: McpServer, _ctx: McpContext, access: McpAccess) {
  const { serviceAccess } = access;

  server.tool(
    'list_tasks',
    'List scheduled tasks for a service.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.listTasks(serviceId));
    }),
  );

  server.tool(
    'create_task',
    'Create a scheduled task (cron). Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      name: z.string().min(1).max(120).describe('Task name'),
      command: z.string().min(1).describe('Command to run in the container'),
      frequency: z.string().min(1).describe('5-field cron expression'),
      container: z.string().nullable().optional().describe('Optional container name override'),
      timeout: z.number().int().min(1).max(86400).optional().describe('Timeout seconds (default 300)'),
      enabled: z.boolean().optional().describe('Enabled (default true)'),
    },
    safe(async ({ serviceId, ...rest }) => {
      await serviceAccess(serviceId, true);
      const body = upsertTaskSchema.parse(rest);
      return json(await ServiceModule.createTask(serviceId, body));
    }),
  );

  server.tool(
    'update_task',
    'Update a scheduled task. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      taskId: z.string().describe('The task ID'),
      name: z.string().min(1).max(120).optional(),
      command: z.string().min(1).optional(),
      frequency: z.string().min(1).optional(),
      container: z.string().nullable().optional(),
      timeout: z.number().int().min(1).max(86400).optional(),
      enabled: z.boolean().optional(),
    },
    safe(async ({ serviceId, taskId, ...rest }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.updateTask(serviceId, taskId, rest));
    }),
  );

  server.tool(
    'delete_task',
    'Delete a scheduled task. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      taskId: z.string().describe('The task ID'),
    },
    safe(async ({ serviceId, taskId }) => {
      await serviceAccess(serviceId, true);
      await ServiceModule.deleteTask(serviceId, taskId);
      return json({ deleted: true, taskId });
    }),
  );

  server.tool(
    'run_task',
    'Run a scheduled task immediately. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      taskId: z.string().describe('The task ID'),
    },
    safe(async ({ serviceId, taskId }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.runTask(serviceId, taskId));
    }),
  );

  server.tool(
    'list_task_executions',
    'List recent executions of a scheduled task.',
    {
      serviceId: z.string().describe('The service ID'),
      taskId: z.string().describe('The task ID'),
    },
    safe(async ({ serviceId, taskId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.listTaskExecutions(serviceId, taskId));
    }),
  );
}

export function buildTaskTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerTaskTools);
}
