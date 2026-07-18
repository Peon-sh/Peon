import type { NextRequest } from 'next/server';
import { ok } from '@/lib/http/response';
import { handleGithubAppEvents } from '@/services/internal/webhooks/github-app';

/**
 * Shared GitHub App webhook POST body.
 * Mounted at both /webhooks/source/github/events and /api/webhooks/source/github/events.
 */
export async function githubAppEventsPost(req: NextRequest) {
  const rawBody = await req.text();
  const result = await handleGithubAppEvents({
    rawBody,
    event: req.headers.get('x-github-event'),
    signature: req.headers.get('x-hub-signature-256'),
    installationTargetId: req.headers.get('x-github-hook-installation-target-id'),
  });
  return ok(result);
}
