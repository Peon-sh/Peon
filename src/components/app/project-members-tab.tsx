'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Users, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { addProjectMember, updateProjectMemberRole } from '@/services/api/project';
import { getWorkspaceMembers } from '@/services/api/workspace';
import { FormField } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { RolePill } from '@/components/app/kind-chip';
import { ConfirmButton } from '@/components/app/confirm';

const PROJECT_ROLES = ['ADMIN', 'MEMBER'] as const;

export type ProjectMember = {
  id: string;
  role: 'ADMIN' | 'MEMBER';
  user: { id: string; email: string; name: string | null };
};

export function ProjectMembersTab({
  projectId,
  workspaceId,
  canManage,
  members,
  onRemove,
}: {
  projectId: string;
  workspaceId: string;
  canManage: boolean;
  members: ProjectMember[];
  onRemove: (userId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');

  const { data: wsMembers } = useQuery({
    queryKey: ['ws-members', workspaceId],
    queryFn: () => getWorkspaceMembers(workspaceId),
    enabled: !!workspaceId && canManage,
  });

  const projectMemberIds = new Set(members.map((m) => m.user.id));
  const addableMembers =
    wsMembers?.members.filter(
      (m) =>
        !projectMemberIds.has(m.user.id) &&
        m.role !== 'OWNER' &&
        m.role !== 'ADMIN',
    ) ?? [];

  const addMut = useMutation({
    mutationFn: () => addProjectMember(projectId, { userId, role }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project-members', projectId] });
      setUserId('');
      setRole('MEMBER');
      setOpen(false);
      toast.success('Member added to project');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const roleMut = useMutation({
    mutationFn: ({ userId: targetUserId, role: nextRole }: { userId: string; role: 'ADMIN' | 'MEMBER' }) =>
      updateProjectMemberRole(projectId, targetUserId, nextRole),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project-members', projectId] });
      toast.success('Role updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const addDialog = (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Add project member</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Alert variant="info" className="mb-4">
            <Info />
            <AlertDescription>
              Choose someone who is already in this workspace. Workspace owners and admins already
              have access to every project.
            </AlertDescription>
          </Alert>
          <div className="space-y-4">
            <FormField label="Workspace member" className="lg:grid-cols-1 lg:gap-2">
              <SearchableSelect
                value={userId}
                onValueChange={setUserId}
                placeholder="Select member"
                options={addableMembers.map((m) => ({
                  value: m.user.id,
                  label: m.user.name ?? m.user.email,
                  keywords: m.user.email,
                }))}
              />
              {!addableMembers.length && (
                <p className="text-muted-foreground mt-2 text-sm">
                  No workspace members available to add. Invite them to the workspace first.
                </p>
              )}
            </FormField>
            <FormField label="Project role" className="lg:grid-cols-1 lg:gap-2">
              <SearchableSelect
                value={role}
                onValueChange={(v) => setRole(v as 'ADMIN' | 'MEMBER')}
                placeholder="Select role"
                options={PROJECT_ROLES.map((r) => ({ value: r, label: r }))}
              />
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => addMut.mutate()}
            disabled={!userId || addMut.isPending || !addableMembers.length}
          >
            Add to project
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  if (!members.length && !canManage) {
    return (
      <EmptyState
        icon={Users}
        title="No project members"
        description="Only workspace members added to this project can access it."
      />
    );
  }

  return (
    <>
      {addDialog}
      {canManage && members.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" /> Add member
          </Button>
        </div>
      )}
      <DataTable<ProjectMember>
        columns={[
          {
            key: 'member',
            header: 'Member',
            cell: (m) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{m.user.name ?? m.user.email}</span>
                <span className="text-muted-foreground truncate text-sm font-normal">
                  {m.user.email}
                </span>
              </span>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            cell: (m) =>
              canManage ? (
                <div className="w-36">
                  <SearchableSelect
                    value={m.role}
                    onValueChange={(r) =>
                      roleMut.mutate({ userId: m.user.id, role: r as 'ADMIN' | 'MEMBER' })
                    }
                    disabled={roleMut.isPending}
                    placeholder="Select role"
                    size="sm"
                    options={PROJECT_ROLES.map((r) => ({ value: r, label: r }))}
                  />
                </div>
              ) : (
                <RolePill role={m.role} />
              ),
          },
          ...(canManage
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  cell: (m: ProjectMember) => (
                    <ConfirmButton
                      title={`Remove ${m.user.name ?? m.user.email}?`}
                      description="They will lose access to this project."
                      confirmLabel="Remove"
                      size="sm"
                      onConfirm={() => onRemove(m.user.id)}
                    >
                      <Trash2 className="size-4" /> Remove
                    </ConfirmButton>
                  ),
                },
              ]
            : []),
        ]}
        rows={members}
        rowKey={(m) => m.id}
        emptyState={
          <EmptyState
            icon={Users}
            title="No project members"
            description="Add workspace members to give them access to this project."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-3.5" /> Add member
              </Button>
            }
          />
        }
      />
    </>
  );
}
