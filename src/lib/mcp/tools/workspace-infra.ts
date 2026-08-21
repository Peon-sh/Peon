import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { PrivateKeyService } from '@/services/internal/privatekey/privatekey';
import { StorageService } from '@/services/internal/storages/storages';
import { TagService } from '@/services/internal/tags/tags';
import { SharedVariableService } from '@/services/internal/shared-variables/shared-variables';
import { NotificationService } from '@/services/internal/notifications/notifications';
import { s3ClientForSafe } from '@/services/external/s3/client';
import { createPrivateKeySchema } from '@/schemas/server.schema';
import { createStorageSchema, updateStorageSchema } from '@/schemas/storages.schema';
import { createTagSchema } from '@/schemas/tags.schema';
import {
  createSharedVariableSchema,
  updateSharedVariableSchema,
} from '@/schemas/shared-variables.schema';
import { upsertChannelSchema, NOTIFICATION_CHANNELS } from '@/schemas/notifications.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerWorkspaceInfraTools(
  server: McpServer,
  ctx: McpContext,
  access: McpAccess,
) {
  const {
    ws,
    infra,
    assertStorageInWorkspace,
    assertKeyInWorkspace,
    assertSharedVariableInWorkspace,
    assertTagInWorkspace,
  } = access;

  // ---- Private keys ----

  server.tool(
    'list_private_keys',
    'List SSH private keys in the workspace (metadata only). Requires OWNER or ADMIN.',
    {},
    safe(async () => {
      await infra();
      return json(await PrivateKeyService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'create_private_key',
    'Create or generate an SSH private key. Requires OWNER or ADMIN. Does not return the private key PEM after generate — download from the UI if needed.',
    {
      name: z.string().min(1).max(80).describe('Key name'),
      description: z.string().max(500).optional().describe('Description'),
      privateKey: z.string().min(1).optional().describe('Paste an existing private key'),
      publicKey: z.string().min(1).optional().describe('Optional public key'),
      generate: z.boolean().optional().describe('Generate a new keypair'),
    },
    safe(async (args) => {
      await infra();
      const body = createPrivateKeySchema.parse(args);
      return json(await PrivateKeyService.create(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'delete_private_key',
    'Delete an SSH private key. Requires OWNER or ADMIN.',
    { keyId: z.string().describe('The private key ID') },
    safe(async ({ keyId }) => {
      await infra();
      await assertKeyInWorkspace(keyId);
      await PrivateKeyService.remove(keyId);
      return json({ deleted: true, keyId });
    }),
  );

  // ---- Storages ----

  server.tool(
    'list_storages',
    'List S3-compatible storages in the workspace.',
    {},
    safe(async () => {
      await ws();
      return json(await StorageService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'get_storage',
    'Get storage details (secrets masked).',
    { storageId: z.string().describe('The storage ID') },
    safe(async ({ storageId }) => {
      await assertStorageInWorkspace(storageId);
      await ws();
      return json(await StorageService.get(storageId));
    }),
  );

  server.tool(
    'create_storage',
    'Create an S3-compatible storage. Requires OWNER or ADMIN.',
    {
      name: z.string().min(1).max(80),
      description: z.string().max(500).nullable().optional(),
      region: z.string().min(1).max(80).optional(),
      endpoint: z.string().max(255).nullable().optional(),
      bucket: z.string().min(1).max(255),
      accessKey: z.string().min(1).max(1000),
      secretKey: z.string().min(1).max(1000),
    },
    safe(async (args) => {
      await infra();
      const body = createStorageSchema.parse(args);
      return json(await StorageService.create(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'update_storage',
    'Update a storage. Requires OWNER or ADMIN.',
    {
      storageId: z.string().describe('The storage ID'),
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
      region: z.string().min(1).max(80).optional(),
      endpoint: z.string().max(255).nullable().optional(),
      bucket: z.string().min(1).max(255).optional(),
      accessKey: z.string().min(1).max(1000).optional(),
      secretKey: z.string().min(1).max(1000).optional(),
    },
    safe(async ({ storageId, ...rest }) => {
      await infra();
      await assertStorageInWorkspace(storageId);
      const body = updateStorageSchema.parse(rest);
      return json(await StorageService.update(storageId, body));
    }),
  );

  server.tool(
    'delete_storage',
    'Delete a storage. Requires OWNER or ADMIN.',
    { storageId: z.string().describe('The storage ID') },
    safe(async ({ storageId }) => {
      await infra();
      await assertStorageInWorkspace(storageId);
      await StorageService.remove(storageId);
      return json({ deleted: true, storageId });
    }),
  );

  server.tool(
    'test_storage',
    'Test S3 storage connectivity (HeadBucket). Requires OWNER or ADMIN.',
    { storageId: z.string().describe('The storage ID') },
    safe(async ({ storageId }) => {
      await infra();
      await assertStorageInWorkspace(storageId);
      const storage = await StorageService.getRaw(storageId);
      const client = await s3ClientForSafe(storage);
      try {
        await client.send(new HeadBucketCommand({ Bucket: storage.bucket }));
        return json({ reachable: true });
      } catch (err) {
        return json({
          reachable: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }),
  );

  // ---- Tags ----

  server.tool(
    'list_tags',
    'List tags in the workspace.',
    {},
    safe(async () => {
      await ws();
      return json(await TagService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'create_tag',
    'Create a tag. Requires OWNER or ADMIN.',
    { name: z.string().min(1).max(80).describe('Tag name') },
    safe(async (args) => {
      await infra();
      const body = createTagSchema.parse(args);
      return json(await TagService.create(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'delete_tag',
    'Delete a tag. Requires OWNER or ADMIN.',
    { tagId: z.string().describe('The tag ID') },
    safe(async ({ tagId }) => {
      await infra();
      await assertTagInWorkspace(tagId);
      await TagService.remove(tagId);
      return json({ deleted: true, tagId });
    }),
  );

  // ---- Shared variables ----

  server.tool(
    'list_shared_variables',
    'List shared environment variables in the workspace.',
    {},
    safe(async () => {
      await ws();
      return json(await SharedVariableService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'create_shared_variable',
    'Create a shared variable (WORKSPACE, PROJECT, or SERVER scope). Requires OWNER or ADMIN.',
    {
      scope: z.enum(['WORKSPACE', 'PROJECT', 'SERVER']).optional(),
      key: z.string().min(1).max(255),
      value: z.string().max(100000),
      comment: z.string().max(500).nullable().optional(),
      isMultiline: z.boolean().optional(),
      isLiteral: z.boolean().optional(),
      projectId: z.string().min(1).nullable().optional(),
      serverId: z.string().min(1).nullable().optional(),
    },
    safe(async (args) => {
      await infra();
      const body = createSharedVariableSchema.parse(args);
      return json(await SharedVariableService.create(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'update_shared_variable',
    'Update a shared variable. Requires OWNER or ADMIN.',
    {
      variableId: z.string().describe('The shared variable ID'),
      key: z.string().min(1).max(255).optional(),
      value: z.string().max(100000).optional(),
      comment: z.string().max(500).nullable().optional(),
      isMultiline: z.boolean().optional(),
      isLiteral: z.boolean().optional(),
    },
    safe(async ({ variableId, ...rest }) => {
      await infra();
      await assertSharedVariableInWorkspace(variableId);
      const body = updateSharedVariableSchema.parse(rest);
      return json(await SharedVariableService.update(variableId, body));
    }),
  );

  server.tool(
    'delete_shared_variable',
    'Delete a shared variable. Requires OWNER or ADMIN.',
    { variableId: z.string().describe('The shared variable ID') },
    safe(async ({ variableId }) => {
      await infra();
      await assertSharedVariableInWorkspace(variableId);
      await SharedVariableService.remove(variableId);
      return json({ deleted: true, variableId });
    }),
  );

  // ---- Notifications ----

  server.tool(
    'list_notifications',
    'List notification channel configuration for the workspace.',
    {},
    safe(async () => {
      await ws();
      return json(await NotificationService.list(ctx.workspaceId));
    }),
  );

  server.tool(
    'upsert_notification',
    'Create or update a notification channel. Requires OWNER or ADMIN.',
    {
      channel: z.enum(NOTIFICATION_CHANNELS).describe('Channel type'),
      enabled: z.boolean().optional().describe('Enabled (default false)'),
      config: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe('Channel-specific config'),
      events: z
        .record(z.string(), z.boolean())
        .optional()
        .describe('Event toggles (deployment_success, deployment_failure, etc.)'),
    },
    safe(async (args) => {
      await infra();
      const body = upsertChannelSchema.parse(args);
      return json(await NotificationService.upsert(ctx.workspaceId, body));
    }),
  );

  server.tool(
    'test_notification',
    'Send a test notification on a channel. Requires OWNER or ADMIN.',
    {
      channel: z.enum(NOTIFICATION_CHANNELS).describe('Channel type to test'),
    },
    safe(async ({ channel }) => {
      await infra();
      return json(await NotificationService.test(ctx.workspaceId, channel));
    }),
  );
}

export function buildWorkspaceInfraTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerWorkspaceInfraTools);
}
