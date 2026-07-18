import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';
import {
  assertServerCanAcceptQueuedDeployment,
  scheduleQueuedDeployment,
} from '@/services/internal/deploy/server-queue';
import { setAuditActor } from '@/services/internal/audit/context';
import { recordServiceAudit } from '@/services/internal/audit/service-audit';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Verify the provider signature using the webhook token as the shared secret. */
export function verifyTokenWebhookSignature(
  provider: string,
  token: string,
  rawBody: string,
  req: NextRequest,
): void {
  if (provider === 'github') {
    const sig = req.headers.get('x-hub-signature-256');
    if (!sig) throw new UnauthorizedError('Missing GitHub signature.');
    const expected = 'sha256=' + createHmac('sha256', token).update(rawBody).digest('hex');
    if (!safeEqual(sig, expected)) throw new UnauthorizedError('Invalid GitHub signature.');
  } else if (provider === 'gitlab') {
    const sig = req.headers.get('x-gitlab-token');
    if (!sig || !safeEqual(sig, token)) throw new UnauthorizedError('Invalid GitLab token.');
  }
  // generic: token in the URL path is the only credential.
}

interface PushInfo {
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
}

/** Best-effort parse of a push payload for branch/commit filtering. */
export function parseTokenWebhookPush(provider: string, body: unknown): PushInfo {
  const p = (body ?? {}) as Record<string, unknown>;
  const ref = typeof p.ref === 'string' ? p.ref : undefined;
  const branch = ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : undefined;

  if (provider === 'gitlab') {
    const commits = Array.isArray(p.commits) ? (p.commits as Record<string, unknown>[]) : [];
    const head = commits[commits.length - 1];
    return {
      branch,
      commitSha: typeof p.checkout_sha === 'string' ? p.checkout_sha : undefined,
      commitMessage: head && typeof head.message === 'string' ? head.message : undefined,
    };
  }

  const headCommit = (p.head_commit ?? null) as Record<string, unknown> | null;
  return {
    branch,
    commitSha: typeof p.after === 'string' ? p.after : undefined,
    commitMessage:
      headCommit && typeof headCommit.message === 'string' ? headCommit.message : undefined,
  };
}

export type TokenDeployResult =
  | { triggered: false; reason: string }
  | { triggered: true; deploymentId: string };

/**
 * Public deploy webhook domain: verify signature, filter branch, enqueue deploy.
 * Prefer `/api/webhooks/source/github/events` when the service uses a GitHub App source.
 */
export async function handleTokenDeployWebhook(opts: {
  token: string;
  rawBody: string;
  req: NextRequest;
}): Promise<TokenDeployResult> {
  const webhook = await prisma.serviceWebhook.findUnique({
    where: { token: opts.token },
    include: { service: { include: { settings: true } } },
  });
  if (!webhook) throw new NotFoundError('Webhook not found.');

  verifyTokenWebhookSignature(webhook.provider, opts.token, opts.rawBody, opts.req);

  let payload: unknown = {};
  try {
    payload = opts.rawBody ? JSON.parse(opts.rawBody) : {};
  } catch {
    payload = {};
  }

  const svc = webhook.service;

  if (svc.settings && svc.settings.isAutoDeployEnabled === false) {
    return { triggered: false, reason: 'auto-deploy disabled' };
  }

  const push = parseTokenWebhookPush(webhook.provider, payload);
  if (opts.req.headers.get('x-github-event') === 'ping') {
    return { triggered: false, reason: 'ping acknowledged' };
  }

  if (push.branch && svc.gitBranch && push.branch !== svc.gitBranch) {
    return { triggered: false, reason: `branch ${push.branch} does not match ${svc.gitBranch}` };
  }

  if (svc.serverId) {
    await assertServerCanAcceptQueuedDeployment(svc.serverId);
  }

  const deployment = await prisma.deployment.create({
    data: {
      serviceId: svc.id,
      status: 'QUEUED',
      triggeredBy: 'webhook',
      commitSha: push.commitSha ?? null,
      commitMessage: push.commitMessage ?? null,
    },
  });
  await scheduleQueuedDeployment({
    deploymentId: deployment.id,
    serviceId: svc.id,
    serverId: svc.serverId,
    kind: svc.kind,
  });

  setAuditActor({ actorType: 'WEBHOOK' });
  await recordServiceAudit(svc.id, {
    action: 'service.deploy',
    summary: `Webhook queued deploy for service`,
    metadata: { deploymentId: deployment.id, trigger: 'token' },
  });

  return { triggered: true, deploymentId: deployment.id };
}
