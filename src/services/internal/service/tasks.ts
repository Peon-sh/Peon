import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/queue/sqs';
import { NotFoundError } from '@/lib/errors';
import type { UpsertTaskInput } from '@/schemas/service.schema';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

export function listTasks(serviceId: string) {
  return prisma.scheduledTask.findMany({
    where: { serviceId },
    orderBy: { createdAt: 'asc' },
    include: {
      executions: { orderBy: { startedAt: 'desc' }, take: 1 },
      _count: { select: { executions: true } },
    },
  });
}

export async function createTask(serviceId: string, input: UpsertTaskInput) {
  const task = await prisma.scheduledTask.create({
    data: {
      serviceId,
      name: input.name,
      command: input.command,
      frequency: input.frequency,
      container: input.container ?? null,
      timeout: input.timeout,
      enabled: input.enabled,
    },
  });
  await recordServiceAudit(serviceId, {
    action: 'service.task.created',
    summary: `Created task "${task.name}"`,
    metadata: { taskId: task.id, name: task.name },
  });
  return task;
}

export async function updateTask(
  serviceId: string,
  taskId: string,
  input: Partial<UpsertTaskInput>,
) {
  const task = await prisma.scheduledTask.findFirst({ where: { id: taskId, serviceId } });
  if (!task) throw new NotFoundError('Task not found.');
  const updated = await prisma.scheduledTask.update({ where: { id: taskId }, data: input });
  await recordServiceAudit(serviceId, {
    action: 'service.task.updated',
    summary: `Updated task "${updated.name}"`,
    metadata: { taskId, fields: Object.keys(input) },
  });
  return updated;
}

export async function deleteTask(serviceId: string, taskId: string) {
  const task = await prisma.scheduledTask.findFirst({
    where: { id: taskId, serviceId },
    select: { id: true, name: true },
  });
  await prisma.scheduledTask.deleteMany({ where: { id: taskId, serviceId } });
  if (task) {
    await recordServiceAudit(serviceId, {
      action: 'service.task.deleted',
      summary: `Deleted task "${task.name}"`,
      metadata: { taskId: task.id },
    });
  }
}

export async function runTask(serviceId: string, taskId: string) {
  const task = await prisma.scheduledTask.findFirst({ where: { id: taskId, serviceId } });
  if (!task) throw new NotFoundError('Task not found.');
  const execution = await prisma.scheduledTaskExecution.create({
    data: { taskId, status: 'RUNNING' },
  });
  await enqueue({ type: 'task.run', taskId, executionId: execution.id });
  await recordServiceAudit(serviceId, {
    action: 'service.task.run',
    summary: `Ran task "${task.name}"`,
    metadata: { taskId, executionId: execution.id },
  });
  return execution;
}

export async function listTaskExecutions(serviceId: string, taskId: string) {
  const task = await prisma.scheduledTask.findFirst({ where: { id: taskId, serviceId } });
  if (!task) throw new NotFoundError('Task not found.');
  return prisma.scheduledTaskExecution.findMany({
    where: { taskId },
    orderBy: { startedAt: 'desc' },
    take: 25,
  });
}
