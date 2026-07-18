'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Users, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
          <Alert className="border-border-bright bg-secondary/60 mb-4">
            <Info className="text-phosphor" />
            <AlertDescription>
              Choose someone who is already in this workspace. Workspace owners and admins already
              have access to every project.
            </AlertDescription>
          </Alert>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Workspace member</Label>
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
                <p className="text-muted-foreground text-xs">
                  No workspace members available to add. Invite them to the workspace first.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Project role</Label>
              <SearchableSelect
                value={role}
                onValueChange={(v) => setRole(v as 'ADMIN' | 'MEMBER')}
                placeholder="Select role"
                options={PROJECT_ROLES.map((r) => ({ value: r, label: r }))}
              />
            </div>
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
        description="only workspace members added to this project can access it."
      />
    );
  }

  return (
    <>
      {addDialog}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <div
            key={m.id}
            className="bg-card hover:border-border-bright hover:bg-secondary flex h-full flex-col overflow-hidden rounded-lg border transition-colors"
          >
            <div className="flex items-start gap-3 p-4">
              <span className="border-border-bright bg-secondary text-phosphor grid size-9 shrink-0 place-items-center rounded-md border text-[11px] font-bold">
                {(m.user.name ?? m.user.email)[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold">
                  {m.user.name ?? m.user.email}
                </p>
                <p className="text-muted-foreground truncate text-[11px]">{m.user.email}</p>
                <div className="mt-2">
                  <RolePill role={m.role} />
                </div>
              </div>
            </div>
            {canManage && (
              <div className="bg-secondary mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
                <div className="min-w-0 flex-1">
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
                <ConfirmButton
                  title={`Remove ${m.user.name ?? m.user.email}?`}
                  description="They will lose access to this project."
                  confirmLabel="Remove"
                  size="sm"
                  onConfirm={() => onRemove(m.user.id)}
                >
                  <Trash2 className="size-4" /> Remove
                </ConfirmButton>
              </div>
            )}
          </div>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-36 place-items-center rounded-lg border border-dashed transition-colors"
          >
            <span className="flex flex-col items-center gap-2 text-[12.5px]">
              <Plus className="size-4" /> add member
            </span>
          </button>
        )}
      </div>
    </>
  );
}
