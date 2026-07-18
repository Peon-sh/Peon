import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireSession } from '@/lib/auth/context';
import { listTemplates, listTemplateCategories } from '@/lib/templates';

export const GET = route(async (request: NextRequest) => {
  await requireSession();
  const search = request.nextUrl.searchParams.get('search') ?? undefined;
  const category = request.nextUrl.searchParams.get('category') ?? undefined;
  return ok({
    templates: listTemplates({ search, category }),
    categories: listTemplateCategories(),
  });
});
