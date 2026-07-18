import { prisma } from '@/lib/prisma';

export interface LogLine {
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
}

/**
 * Append log lines to a deployment. Logs are stored as a JSON array so they can
 * be polled/streamed by the UI. Kept simple and append-only.
 */
export async function appendDeploymentLog(
  deploymentId: string,
  message: string,
  stream: LogLine['stream'] = 'system',
): Promise<void> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { logs: true },
  });
  const existing = (deployment?.logs as unknown as LogLine[] | null) ?? [];
  existing.push({ ts: Date.now(), stream, message });
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { logs: existing as unknown as object },
  });
}

export function makeDeploymentLogger(deploymentId: string) {
  return {
    info: (msg: string) => appendDeploymentLog(deploymentId, msg, 'system'),
    stdout: (msg: string) => appendDeploymentLog(deploymentId, msg, 'stdout'),
    stderr: (msg: string) => appendDeploymentLog(deploymentId, msg, 'stderr'),
  };
}
