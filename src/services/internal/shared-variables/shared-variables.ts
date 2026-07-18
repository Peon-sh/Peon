import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto/encryption';
import { NotFoundError } from '@/lib/errors';
import type {
  CreateSharedVariableInput,
  UpdateSharedVariableInput,
} from '@/schemas/shared-variables.schema';
import { AuditService } from '@/services/internal/audit/audit';

const listSelect = {
  id: true,
  workspaceId: true,
  scope: true,
  key: true,
  comment: true,
  isMultiline: true,
  isLiteral: true,
  projectId: true,
  serverId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const SharedVariableService = {
  async list(workspaceId: string) {
    const vars = await prisma.sharedEnvironmentVariable.findMany({
      where: { workspaceId },
      select: listSelect,
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return vars.map((v) => ({ ...v, value: '••••••' }));
  },

  async create(workspaceId: string, input: CreateSharedVariableInput) {
    const { value, ...rest } = input;
    const row = await prisma.sharedEnvironmentVariable.create({
      data: {
        scope: rest.scope,
        key: rest.key,
        comment: rest.comment ?? null,
        isMultiline: rest.isMultiline ?? false,
        isLiteral: rest.isLiteral ?? false,
        projectId: rest.scope === 'PROJECT' ? (rest.projectId ?? null) : null,
        serverId: rest.scope === 'SERVER' ? (rest.serverId ?? null) : null,
        workspaceId,
        value: encrypt(value),
      },
      select: listSelect,
    });
    await AuditService.record({
      workspaceId,
      action: 'shared_variable.created',
      resourceType: 'shared_variable',
      resourceId: row.id,
      resourceName: row.key,
      summary: `Created shared variable "${row.key}"`,
      metadata: { scope: row.scope, key: row.key },
    });
    return row;
  },

  async workspaceIdFor(variableId: string): Promise<string> {
    const row = await prisma.sharedEnvironmentVariable.findUnique({
      where: { id: variableId },
      select: { workspaceId: true },
    });
    if (!row) throw new NotFoundError('Shared variable not found.');
    return row.workspaceId;
  },

  async update(variableId: string, input: UpdateSharedVariableInput) {
    const { value, ...rest } = input;
    const row = await prisma.sharedEnvironmentVariable.update({
      where: { id: variableId },
      data: {
        ...rest,
        ...(value !== undefined ? { value: encrypt(value) } : {}),
      },
      select: listSelect,
    });
    await AuditService.record({
      workspaceId: row.workspaceId,
      action: 'shared_variable.updated',
      resourceType: 'shared_variable',
      resourceId: row.id,
      resourceName: row.key,
      summary: `Updated shared variable "${row.key}"`,
      metadata: { key: row.key },
    });
    return row;
  },

  async remove(variableId: string) {
    const row = await prisma.sharedEnvironmentVariable.findUnique({
      where: { id: variableId },
      select: { id: true, key: true, workspaceId: true },
    });
    await prisma.sharedEnvironmentVariable.delete({ where: { id: variableId } });
    if (row) {
      await AuditService.record({
        workspaceId: row.workspaceId,
        action: 'shared_variable.deleted',
        resourceType: 'shared_variable',
        resourceId: row.id,
        resourceName: row.key,
        summary: `Deleted shared variable "${row.key}"`,
        metadata: { key: row.key },
      });
    }
  },
};
