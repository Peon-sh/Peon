import { prisma } from '@/lib/prisma';
import type { User, Workspace } from '@/lib/prisma';
import { slugify, randomSuffix } from '@/lib/utils/slug';

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${randomSuffix(4)}`;
  }
  return slug;
}

/** Create a personal workspace for a new user and make them OWNER. */
export async function createPersonalWorkspace(user: User): Promise<Workspace> {
  const name = user.name ? `${user.name}'s Workspace` : 'Personal Workspace';
  const slug = await uniqueSlug(user.name ?? user.email.split('@')[0]);

  return prisma.workspace.create({
    data: {
      name,
      slug,
      personal: true,
      ownerId: user.id,
      memberships: {
        create: { userId: user.id, role: 'OWNER' },
      },
    },
  });
}
