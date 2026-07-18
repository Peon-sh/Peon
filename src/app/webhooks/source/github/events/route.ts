import { route } from '@/lib/http/response';
import { githubAppEventsPost } from '@/lib/webhooks/github-app-route';

/**
 * GitHub App webhook path.
 * Configure this URL on the GitHub App itself — not per repository.
 */
export const POST = route(githubAppEventsPost);
