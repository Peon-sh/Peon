import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handleError } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { requireInfraAccess } from '@/lib/auth/access';
import { publicEnv } from '@/lib/env';
import { verifyGithubConnectState } from '@/lib/github/connect-state';
import { SourceService } from '@/services/internal/sources/sources';
import { AppError } from '@/lib/errors';

/**
 * GitHub App Setup URL callback.
 * Query: installation_id, setup_action, state
 */
export const GET = async (request: NextRequest) => {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;
    const state = sp.get('state');
    const installationId = sp.get('installation_id');
    const setupAction = sp.get('setup_action');

    const payload = verifyGithubConnectState(state);
    if (payload.userId !== user.id) {
      throw new AppError('GitHub connect state does not match the signed-in user.', 403, 'FORBIDDEN');
    }
    await requireInfraAccess(payload.workspaceId);

    const { app } = await SourceService.completePlatformConnect({
      state,
      installationId,
      setupAction,
      sessionUserId: user.id,
    });

    const dest = new URL(`/sources/${app.id}`, publicEnv.appUrl);
    dest.searchParams.set('github', 'connected');
    return NextResponse.redirect(dest);
  } catch (error) {
    const accept = request.headers.get('accept') ?? '';
    if (accept.includes('text/html') || !accept.includes('application/json')) {
      const dest = new URL('/sources', publicEnv.appUrl);
      const message = error instanceof Error ? error.message : 'GitHub connection failed';
      dest.searchParams.set('github', 'error');
      dest.searchParams.set('message', message.slice(0, 200));
      return NextResponse.redirect(dest);
    }
    return handleError(error);
  }
};
