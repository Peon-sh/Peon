import { route } from '@/lib/http/response';
import { githubAppEventsPost } from '@/lib/webhooks/github-app-route';

/** Alias of /webhooks/source/github/events for callers that expect an /api prefix. */
export const POST = route(githubAppEventsPost);
