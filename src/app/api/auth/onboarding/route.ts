import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireSession, requireUser } from '@/lib/auth/context';
import { setAuthCookie } from '@/lib/auth/cookies';
import { reissueToken } from '@/services/internal/auth/auth';
import { ensureLocalServer } from '@/services/internal/server/local-server';
import { prisma } from '@/lib/prisma';
import { onboardingCompleteSchema } from '@/schemas/auth.schema';

/**
 * Marks the current user as onboarded (wizard completed or skipped).
 *
 * When the wizard's "run workloads on this server" option is chosen, the local
 * server is registered here. That is the whole point of the option: the user
 * must never hand-create a Server row, generate a keypair for their own machine,
 * or point Peon at 127.0.0.1.
 *
 * Registration is idempotent and best-effort — failing to create it must not
 * trap the user in onboarding forever, since they can add servers later from the
 * Servers page.
 */
export const POST = route(async (request: NextRequest) => {
  const session = await requireSession();
  const user = await requireUser();

  // Body is optional: older clients post nothing.
  let useLocalServer = false;
  try {
    const raw = await request.json();
    useLocalServer = onboardingCompleteSchema.parse(raw).useLocalServer ?? false;
  } catch {
    // No body, or an unparseable one — treat as "skipped".
  }

  let localServerId: string | null = null;
  if (useLocalServer) {
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId: user.id, role: { in: ['OWNER', 'ADMIN'] } },
      orderBy: { createdAt: 'asc' },
      select: { workspaceId: true },
    });
    if (membership) {
      try {
        const server = await ensureLocalServer({ workspaceId: membership.workspaceId });
        localServerId = server.id;
      } catch (err) {
        // Never block onboarding on this; the user can add it from Servers.
        console.error('[onboarding] failed to register the local server:', err);
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isOnboarded: true,
      onboardingCompletedAt: new Date(),
    },
  });

  const token = await reissueToken(updated, session.sid!);
  await setAuthCookie(token);

  return ok({ isOnboarded: true, localServerId });
});
