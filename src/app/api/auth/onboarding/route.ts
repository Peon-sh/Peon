import { ok, route } from '@/lib/http/response';
import { requireSession, requireUser } from '@/lib/auth/context';
import { setAuthCookie } from '@/lib/auth/cookies';
import { reissueToken } from '@/services/internal/auth/auth';
import { prisma } from '@/lib/prisma';

/** Marks the current user as onboarded (wizard completed or skipped). */
export const POST = route(async () => {
  const session = await requireSession();
  const user = await requireUser();
  const completedAt = new Date();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      isOnboarded: true,
      onboardingCompletedAt: completedAt,
    },
  });

  const token = await reissueToken(updated, session.sid!);
  await setAuthCookie(token);

  return ok({ isOnboarded: true });
});
