import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServiceModule } from '@/services/internal/service/service';
import { ServiceRuntime } from '@/services/internal/service/runtime';
import { createServiceSchema, updateServiceSchema } from '@/schemas/service.schema';
import { buildCatalogFromLegacy } from '@/lib/mcp/catalog/legacy';
import type { CatalogTool } from '@/lib/mcp/catalog/types';
import { json, safe, type McpContext } from '@/lib/mcp/helpers';
import { SERVICE_CONTROL_ACTIONS } from '@/lib/service-control';
import type { McpAccess } from '@/lib/mcp/access';

export function registerServiceTools(server: McpServer, ctx: McpContext, access: McpAccess) {
  const { projectAccess, serviceAccess } = access;

  server.tool(
    'list_services',
    'List all services in a project.',
    { projectId: z.string().describe('The project ID') },
    safe(async ({ projectId }) => {
      await projectAccess(projectId);
      return json(await ServiceModule.listByProject(projectId));
    }),
  );

  server.tool(
    'get_service',
    'Get full details of a service (configuration, domains, server, health checks, counts).',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.get(serviceId));
    }),
  );

  server.tool(
    'create_service',
    'Create a service in a project. Requires manage access. Pass a service object with kind (GIT_APP, DOCKERFILE, DOCKER_IMAGE, STATIC, NIXPACKS, DATABASE, COMPOSE) and kind-specific fields.',
    {
      projectId: z.string().describe('The project ID'),
      service: createServiceSchema.describe('Service create payload'),
    },
    safe(async ({ projectId, service }) => {
      await projectAccess(projectId, true);
      const body = createServiceSchema.parse(service);
      return json(await ServiceModule.create(projectId, body));
    }),
  );

  server.tool(
    'create_service_from_template',
    'Create a compose service from a one-click template. Requires manage access.',
    {
      projectId: z.string().describe('The project ID'),
      slug: z.string().min(1).describe('Template slug from list_templates'),
      name: z.string().min(1).max(100).optional().describe('Service name override'),
      serverId: z.string().min(1).describe('Target server ID'),
      destinationId: z.string().optional().describe('Optional destination ID'),
    },
    safe(async ({ projectId, slug, name, serverId, destinationId }) => {
      await projectAccess(projectId, true);
      return json(
        await ServiceModule.createFromTemplate(projectId, { slug, name, serverId, destinationId }),
      );
    }),
  );

  server.tool(
    'update_service',
    'Update service settings (domains, git, build, health checks, etc.). Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      updates: updateServiceSchema.describe('Fields to update'),
    },
    safe(async ({ serviceId, updates }) => {
      await serviceAccess(serviceId, true);
      const body = updateServiceSchema.parse(updates);
      return json(await ServiceModule.update(serviceId, body));
    }),
  );

  server.tool(
    'delete_service',
    'Delete a service from Peon. Does not stop or remove containers on the server — stop the service first. Requires manage access.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId, true);
      await ServiceModule.remove(serviceId);
      return json({ deleted: true, serviceId });
    }),
  );

  server.tool(
    'get_service_config',
    'Get decrypted service config sections (database credentials, compose env). Requires manage access.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.getServiceConfig(serviceId));
    }),
  );

  server.tool(
    'update_service_config',
    'Update service config values (database credentials, compose secrets). Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      values: z.record(z.string(), z.string()).describe('Config key/value pairs'),
    },
    safe(async ({ serviceId, values }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.updateServiceConfig(serviceId, values));
    }),
  );

  server.tool(
    'get_service_status',
    'Get the live container status of a deployed service (docker ps).',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceRuntime.status(serviceId));
    }),
  );

  server.tool(
    'deploy_service',
    'Queue a deployment for a service. Requires manage access to the project.',
    {
      serviceId: z.string().describe('The service ID'),
      force: z.boolean().optional().describe('Force a full rebuild (skip build cache)'),
      restartOnly: z
        .boolean()
        .optional()
        .describe('Restart the existing container without rebuilding'),
    },
    safe(async ({ serviceId, force, restartOnly }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.deploy(serviceId, ctx.user.id, { force, restartOnly }));
    }),
  );

  server.tool(
    'control_service',
    'Start, stop, restart, suspend, or resume a service container. Suspend stops the containers '
      + 'and keeps them stopped, blocking deploys, git webhooks, and scheduled tasks and backups '
      + 'until the service is resumed; configuration, domains, and volumes are kept. '
      + 'Requires manage access to the project.',
    {
      serviceId: z.string().describe('The service ID'),
      action: z.enum(SERVICE_CONTROL_ACTIONS).describe('Container action'),
    },
    safe(async ({ serviceId, action }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.control(serviceId, action));
    }),
  );

  server.tool(
    'rollback_service',
    'Roll back a service to a previous deployment commit. Requires manage access.',
    {
      serviceId: z.string().describe('The service ID'),
      deploymentId: z.string().describe('Prior deployment ID to roll back to'),
    },
    safe(async ({ serviceId, deploymentId }) => {
      await serviceAccess(serviceId, true);
      return json(await ServiceModule.rollback(serviceId, deploymentId, ctx.user.id));
    }),
  );

  server.tool(
    'list_deployments',
    'List recent deployments of a service with status and commit info.',
    { serviceId: z.string().describe('The service ID') },
    safe(async ({ serviceId }) => {
      await serviceAccess(serviceId);
      return json(await ServiceModule.listDeployments(serviceId));
    }),
  );

  server.tool(
    'get_deployment',
    'Get a deployment including its build/deploy logs.',
    { deploymentId: z.string().describe('The deployment ID') },
    safe(async ({ deploymentId }) => {
      const deployment = await ServiceModule.getDeployment(deploymentId);
      await serviceAccess((deployment as { serviceId: string }).serviceId);
      return json(deployment);
    }),
  );

  server.tool(
    'cancel_deployment',
    'Cancel a queued or in-progress deployment. Requires manage access to the project.',
    { deploymentId: z.string().describe('The deployment ID') },
    safe(async ({ deploymentId }) => {
      const deployment = await ServiceModule.getDeployment(deploymentId);
      await serviceAccess((deployment as { serviceId: string }).serviceId, true);
      return json(await ServiceModule.cancelDeployment(deploymentId));
    }),
  );

  server.tool(
    'get_service_logs',
    'Tail runtime logs of the service container.',
    {
      serviceId: z.string().describe('The service ID'),
      tail: z.number().min(1).max(5000).optional().describe('Number of log lines (default 200)'),
      since: z
        .string()
        .optional()
        .describe('Only logs since this time, e.g. "10m" or an RFC3339 timestamp'),
    },
    safe(async ({ serviceId, tail, since }) => {
      await serviceAccess(serviceId);
      return json(await ServiceRuntime.logs(serviceId, { tail, since }));
    }),
  );
}

export function buildServiceTools(): CatalogTool[] {
  return buildCatalogFromLegacy(registerServiceTools);
}
