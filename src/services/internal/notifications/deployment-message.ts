import { serverEnv } from '@/lib/env';
import {
  absolutePublicUrl,
  type NotificationMessage,
  type NotificationSeverity,
} from '@/services/internal/notifications/format';

export interface DeploymentNotifyContext {
  serviceName: string;
  projectId: string;
  projectName?: string | null;
  serviceId: string;
  deploymentId: string;
  fqdn?: string | null;
  error?: string;
}

function peonBase(): string {
  return serverEnv().APP_URL.replace(/\/$/, '');
}

export function servicePageUrl(projectId: string, serviceId: string): string {
  return `${peonBase()}/projects/${projectId}/services/${serviceId}`;
}

export function deploymentPageUrl(
  projectId: string,
  serviceId: string,
  deploymentId: string,
): string {
  return `${peonBase()}/projects/${projectId}/services/${serviceId}/deployments/${deploymentId}`;
}

/** Rich deployment success/failure message for Slack and other channels. */
export function buildDeploymentMessage(
  outcome: 'success' | 'failure',
  ctx: DeploymentNotifyContext,
): NotificationMessage {
  const severity: NotificationSeverity = outcome === 'success' ? 'success' : 'error';
  const subject =
    outcome === 'success'
      ? `Deployment succeeded · ${ctx.serviceName}`
      : `Deployment failed · ${ctx.serviceName}`;

  const text =
    outcome === 'success'
      ? `New version of "${ctx.serviceName}" is live.`
      : `Service "${ctx.serviceName}" failed to deploy${ctx.error ? `: ${ctx.error}` : '.'}`;

  const appUrl = absolutePublicUrl(ctx.fqdn);
  const fields = [
    ...(ctx.projectName ? [{ label: 'Project', value: ctx.projectName }] : []),
    { label: 'Service', value: ctx.serviceName },
    ...(outcome === 'failure' && ctx.error
      ? [{ label: 'Error', value: ctx.error }]
      : []),
    ...(appUrl ? [{ label: 'App', value: appUrl.replace(/^https?:\/\//, '') }] : []),
  ];

  const links = [
    { label: 'View logs', url: deploymentPageUrl(ctx.projectId, ctx.serviceId, ctx.deploymentId) },
    { label: 'Open in Peon', url: servicePageUrl(ctx.projectId, ctx.serviceId) },
    ...(appUrl ? [{ label: 'Open app', url: appUrl }] : []),
  ];

  return { subject, text, severity, fields, links };
}
