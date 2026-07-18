import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import type { CreateTagInput } from '@/schemas/tags.schema';
import { AuditService } from '@/services/internal/audit/audit';

export const TagService = {
  list(workspaceId: string) {
    return prisma.tag.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { services: true } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(workspaceId: string, input: CreateTagInput) {
    const tag = await prisma.tag.create({
      data: { workspaceId, name: input.name },
      select: { id: true, name: true, createdAt: true },
    });
    await AuditService.record({
      workspaceId,
      action: 'tag.created',
      resourceType: 'tag',
      resourceId: tag.id,
      resourceName: tag.name,
      summary: `Created tag "${tag.name}"`,
    });
    return tag;
  },

  async workspaceIdFor(tagId: string): Promise<string> {
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { workspaceId: true },
    });
    if (!tag) throw new NotFoundError('Tag not found.');
    return tag.workspaceId;
  },

  async remove(tagId: string) {
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { id: true, name: true, workspaceId: true },
    });
    await prisma.tag.delete({ where: { id: tagId } });
    if (tag) {
      await AuditService.record({
        workspaceId: tag.workspaceId,
        action: 'tag.deleted',
        resourceType: 'tag',
        resourceId: tag.id,
        resourceName: tag.name,
        summary: `Deleted tag "${tag.name}"`,
      });
    }
  },
};
