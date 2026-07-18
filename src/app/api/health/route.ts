import { ok, route } from '@/lib/http/response';

export const GET = route(async () => ok({ status: 'ok', ts: Date.now() }));
