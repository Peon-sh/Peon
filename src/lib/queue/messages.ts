/** Message contracts exchanged between the app (producer) and worker (consumer). */

export interface DeployJob {
  type: 'deploy';
  deploymentId: string;
  serviceId: string;
  force?: boolean;
  restartOnly?: boolean;
  isPreview?: boolean;
  pullRequestId?: number;
}

export interface ServerValidateJob {
  type: 'server.validate';
  serverId: string;
  installDocker?: boolean;
  sessionId?: string;
}

export interface ProxyJob {
  type: 'proxy';
  serverId: string;
  action: 'start' | 'stop' | 'restart' | 'redeploy';
  sessionId?: string;
}

export interface ServiceControlJob {
  type: 'service.control';
  serviceId: string;
  /** `suspend`/`resume` also flip the durable Service.suspendedAt desired state. */
  action: 'start' | 'stop' | 'restart' | 'suspend' | 'resume';
}

export interface DatabaseProvisionJob {
  type: 'database.provision';
  serviceId: string;
  deploymentId: string;
}

export interface BackupJob {
  type: 'backup.run';
  backupId: string;
  executionId: string;
}

export interface BackupRestoreJob {
  type: 'backup.restore';
  serviceId: string;
  filename: string;
}

export interface TaskJob {
  type: 'task.run';
  taskId: string;
  executionId: string;
}

export interface ServerCleanupJob {
  type: 'server.cleanup';
  serverId: string;
  sessionId?: string;
}

export interface EmailSendJob {
  type: 'email.send';
  to: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export type QueueMessage =
  | DeployJob
  | ServerValidateJob
  | ProxyJob
  | ServiceControlJob
  | DatabaseProvisionJob
  | BackupJob
  | BackupRestoreJob
  | TaskJob
  | ServerCleanupJob
  | EmailSendJob;

export type QueueName = 'deployments' | 'tasks';

/** Which queue a message should be routed to. */
export function queueForMessage(msg: QueueMessage): QueueName {
  switch (msg.type) {
    case 'deploy':
    case 'database.provision':
    case 'service.control':
      return 'deployments';
    default:
      return 'tasks';
  }
}
