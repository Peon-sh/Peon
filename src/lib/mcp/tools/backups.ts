import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BackupModule } from '@/services/internal/backup/module';
import { upsertBackupSchema } from '@/schemas/service.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerBackupTools(server: McpServer, _ctx: McpContext, access: McpAccess) {
  const { serviceAccess } = access;

  server.tool(
    'list_backups',
    'List backup schedules for a service (databases).',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await BackupModule.list(serviceId));
    }),
  );

  server.tool(
    'create_backup',
    'Create a backup schedule. Requires manage access. By default dumps the entire database instance (all DBs).',
    {
      serviceId: z.string().describe('The service ID'),
      frequency: z.string().min(1).describe('5-field cron expression'),
      enabled: z.boolean().optional().describe('Enabled (default true)'),
      saveS3: z.boolean().optional().describe('Also save to S3 (default false)'),
      s3StorageId: z.string().nullable().optional().describe('S3 storage ID when saveS3 is true'),
      retentionAmountLocal: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .optional()
        .describe('Local retention count (default 7)'),
      dumpAll: z
        .boolean()
        .optional()
        .describe('Dump entire instance / all databases (default true). Set false for configured DB only.'),
    },
    safe(async ({ serviceId, ...rest }) => {
      await serviceAccess(serviceId, true);
      const body = upsertBackupSchema.parse(rest);
      return json(await BackupModule.create(serviceId, body));
    }),
  );

  server.tool(
    'update_backup',
    'Update a backup schedule. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      backupId: z.string().describe('The backup ID'),
      frequency: z.string().min(1).optional(),
      enabled: z.boolean().optional(),
      saveS3: z.boolean().optional(),
      s3StorageId: z.string().nullable().optional(),
      retentionAmountLocal: z.number().int().min(0).max(1000).optional(),
      dumpAll: z.boolean().optional().describe('Dump entire instance when true'),
    },
    safe(async ({ serviceId, backupId, ...rest }) => {
      await serviceAccess(serviceId, true);
      return json(await BackupModule.update(serviceId, backupId, rest));
    }),
  );

  server.tool(
    'delete_backup',
    'Delete a backup schedule. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      backupId: z.string().describe('The backup ID'),
    },
    safe(async ({ serviceId, backupId }) => {
      await serviceAccess(serviceId, true);
      await BackupModule.remove(serviceId, backupId);
      return json({ deleted: true, backupId });
    }),
  );

  server.tool(
    'run_backup',
    'Run a backup schedule immediately. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      backupId: z.string().describe('The backup ID'),
    },
    safe(async ({ serviceId, backupId }) => {
      await serviceAccess(serviceId, true);
      return json(await BackupModule.runNow(serviceId, backupId));
    }),
  );

  server.tool(
    'list_backup_executions',
    'List recent backup executions (paginated, newest first).',
    {
      serviceId: z.string().describe('The service ID'),
      backupId: z.string().describe('The backup ID'),
      limit: z.number().int().min(1).max(50).optional().describe('Page size (default 5)'),
      cursor: z.string().optional().describe('Cursor from a previous page nextCursor'),
    },
    safe(async ({ serviceId, backupId, limit, cursor }) => {
      await serviceAccess(serviceId);
      return json(await BackupModule.listExecutions(serviceId, backupId, { limit, cursor }));
    }),
  );

  server.tool(
    'restore_backup',
    'Queue a database restore from a backup filename. Requires manage access. Runs asynchronously on the worker.',
    {
      serviceId: z.string().describe('The service ID'),
      filename: z.string().min(1).describe('Backup filename to restore'),
    },
    safe(async ({ serviceId, filename }) => {
      await serviceAccess(serviceId, true);
      return json(await BackupModule.queueRestore(serviceId, filename));
    }),
  );
}

export function buildBackupTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerBackupTools);
}
