import { ok, route } from '@/lib/http/response';
import { requireSession } from '@/lib/auth/context';
import { clearAuthCookie } from '@/lib/auth/cookies';
import { resolveProfilePictureUrl } from '@/lib/auth/profile-picture';
import { isInstanceOwnerEmail } from '@/lib/auth/instance-owner';
import { UnauthorizedError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getUserById } from '@/services/internal/auth/users';

export const GET = route(async () => {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  if (!user) {
    await clearAuthCookie();
    throw new UnauthorizedError();
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (!user.lastSeenAt || user.lastSeenAt < fiveMinutesAgo) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });
  }

  const memberships = await prisma.workspaceMembership.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      profilePicture: await resolveProfilePictureUrl(user.profilePicture),
      hasPassword: Boolean(user.passwordHash),
      isInstanceAdmin: user.isInstanceAdmin,
      isInstanceOwner: isInstanceOwnerEmail(user.email),
      isOnboarded: user.isOnboarded,
    },
    workspaces: memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      personal: m.workspace.personal,
    })),
  });
});
