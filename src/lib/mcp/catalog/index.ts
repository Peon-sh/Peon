import type { CatalogTool } from '@/lib/mcp/catalog/types';
import type { McpContext } from '@/lib/mcp/helpers';
import { buildBackupTools } from '@/lib/mcp/tools/backups';
import { buildEnvTools } from '@/lib/mcp/tools/env';
import { buildServerTools } from '@/lib/mcp/tools/servers';
import { buildServiceTools } from '@/lib/mcp/tools/services';
import { buildSourceTools } from '@/lib/mcp/tools/sources';
import { buildTaskTools } from '@/lib/mcp/tools/tasks';
import { buildTemplateTools } from '@/lib/mcp/tools/templates';
import { buildVolumeTools } from '@/lib/mcp/tools/volumes';
import { buildWebhookPreviewTools } from '@/lib/mcp/tools/webhooks-previews';
import { buildWorkspaceInfraTools } from '@/lib/mcp/tools/workspace-infra';
import { buildWorkspaceProjectTools } from '@/lib/mcp/tools/workspace-projects';

export function assembleAllTools(ctx: McpContext): CatalogTool[] {
  void ctx;
  return [
    ...buildWorkspaceProjectTools(),
    ...buildServerTools(),
    ...buildServiceTools(),
    ...buildEnvTools(),
    ...buildVolumeTools(),
    ...buildTaskTools(),
    ...buildBackupTools(),
    ...buildWebhookPreviewTools(),
    ...buildTemplateTools(),
    ...buildSourceTools(),
    ...buildWorkspaceInfraTools(),
  ];
}
