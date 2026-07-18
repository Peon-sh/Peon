import { prisma } from '@/lib/prisma';
import { sshPool, sshTargetForServer } from '@/lib/ssh';
import { containerName } from '@/lib/docker/naming';
import { dockerExecShellCommand } from '@/lib/shell/quote';
import { notifyService } from '@/services/internal/notifications/events';

export async function runScheduledTask(taskId: string, executionId: string): Promise<void> {
  const task = await prisma.scheduledTask.findUnique({
    where: { id: taskId },
    include: { service: true },
  });
  if (!task) throw new Error('Task not found.');
  const svc = task.service;
  if (!svc.serverId) throw new Error('Service has no server.');

  const target = await sshTargetForServer(svc.serverId);
  const container = task.container || svc.activeContainerName || containerName(svc.name, svc.uuid);
  const start = Date.now();

  try {
    // Single-quote the command so the remote SSH shell does not expand $VARS
    // (e.g. $CRON_SECRET) before they reach the container.
    const res = await sshPool.exec(target, dockerExecShellCommand(container, task.command));
    await prisma.scheduledTaskExecution.update({
      where: { id: executionId },
      data: {
        status: res.code === 0 ? 'SUCCESS' : 'FAILED',
        message: (res.stdout + res.stderr).slice(0, 10000),
        duration: Date.now() - start,
        finishedAt: new Date(),
      },
    });
    if (res.code !== 0) throw new Error('Task exited non-zero.');
    await notifyService(svc.id, 'task_success', {
      subject: `Scheduled task succeeded: ${task.name}`,
      text: `Scheduled task "${task.name}" on "${svc.name}" completed successfully.`,
    });
  } catch (err) {
    await prisma.scheduledTaskExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
        finishedAt: new Date(),
      },
    }).catch(() => {});
    await notifyService(svc.id, 'task_failure', {
      subject: `Scheduled task failed: ${task.name}`,
      text: `Scheduled task "${task.name}" on "${svc.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
}
