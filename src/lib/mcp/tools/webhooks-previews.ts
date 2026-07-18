import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceModule } from '@/services/internal/service/service';
import { createWebhookSchema } from '@/schemas/service.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import type { McpAccess } from '@/lib/mcp/access';

export function registerWebhookPreviewTools(
  server: McpServer,
  _ctx: McpContext,
  access: McpAccess,
) {
  const { serviceAccess } = access;

  server.tool(
    'list_webhooks',
    'List deploy webhooks for a service.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.listWebhooks(serviceId));
    }),
  );

  server.tool(
    'create_webhook',
    'Create a deploy webhook. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      provider: z
        .enum(['generic', 'github', 'gitlab'])
        .optional()
        .describe('Webhook provider (default generic)'),
    },
    safe(async ({ serviceId, provider }) => {
      await serviceAccess(serviceId, true);
      const body = createWebhookSchema.parse({ provider });
      return json(await ServiceModule.createWebhook(serviceId, body.provider));
    }),
  );

  server.tool(
    'delete_webhook',
    'Delete a deploy webhook. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      webhookId: z.string().describe('The webhook ID'),
    },
    safe(async ({ serviceId, webhookId }) => {
      await serviceAccess(serviceId, true);
      await ServiceModule.deleteWebhook(serviceId, webhookId);
      return json({ deleted: true, webhookId });
    }),
  );

  server.tool(
    'list_previews',
    'List preview deployments for a service.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.listPreviews(serviceId));
    }),
  );

  server.tool(
    'delete_preview',
    'Delete a preview deployment. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      previewId: z.string().describe('The preview ID'),
    },
    safe(async ({ serviceId, previewId }) => {
      await serviceAccess(serviceId, true);
      await ServiceModule.deletePreview(serviceId, previewId);
      return json({ deleted: true, previewId });
    }),
  );
}

export function buildWebhookPreviewTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerWebhookPreviewTools);
}
