'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Section, Panel } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { RolePill } from '@/components/app/kind-chip';
import { ConfirmButton } from '@/components/app/confirm';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import {
  getWorkspaceMembers,
  inviteWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
} from '@/services/api/workspace';

const ROLES = ['ADMIN', 'BILLING_ADMIN', 'MEMBER'] as const;

export default function MembersPage() {
  const { currentWorkspaceId, user } = useAuthStore();
  const workspace = currentWorkspace();
  const canManage = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const wsId = currentWorkspaceId!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('MEMBER');

  const { data, isLoading } = useQuery({
    queryKey: ['ws-members', wsId],
    queryFn: () => getWorkspaceMembers(wsId),
    enabled: !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ws-members', wsId] });

  const inviteMut = useMutation({
    mutationFn: () => inviteWorkspaceMember(wsId, { email, role }),
    onSuccess: async () => {
      await invalidate();
      setEmail('');
      setRole('MEMBER');
      setOpen(false);
      toast.success('Invitation sent');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateWorkspaceMemberRole(wsId, userId, role),
    onSuccess: async () => {
      await invalidate();
      toast.success('Role updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(wsId, userId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Member removed');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeWorkspaceInvitation(wsId, id),
    onSuccess: invalidate,
  });

  const inviteDialog = (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Invite workspace member</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <SearchableSelect
                value={role}
                onValueChange={setRole}
                placeholder="Select role"
                options={ROLES.map((r) => ({ value: r, label: r }))}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => inviteMut.mutate()} disabled={!email || inviteMut.isPending}>
            Send invitation
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return (
    <>
      {inviteDialog}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-accent h-36 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !data?.members.length ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="invite teammates to collaborate in this workspace."
          action={
            canManage ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Invite member
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.members.map((m) => (
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
              <div className="bg-secondary mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  {m.role === 'OWNER' ? (
                    <p className="text-muted-foreground text-[11px]">
                      Owner — transfer ownership from the Danger tab
                    </p>
                  ) : (
                    <SearchableSelect
                      value={m.role}
                      onValueChange={(r) => roleMut.mutate({ userId: m.user.id, role: r })}
                      placeholder="Select role"
                      size="sm"
                      disabled={!canManage || roleMut.isPending}
                      options={ROLES.map((r) => ({ value: r, label: r }))}
                    />
                  )}
                </div>
                {canManage && m.user.id !== user?.id && m.role !== 'OWNER' && (
                  <ConfirmButton
                    title={`Remove ${m.user.name ?? m.user.email}?`}
                    description="They will lose access to this workspace and its projects."
                    confirmLabel="Remove"
                    size="sm"
                    disabled={removeMut.isPending}
                    onConfirm={() => removeMut.mutate(m.user.id)}
                  >
                    <Trash2 className="size-4" /> Remove
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
          {canManage && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="border-border-bright text-muted-foreground hover:text-phosphor hover:border-phosphor-dim grid min-h-36 place-items-center rounded-lg border border-dashed transition-colors"
            >
              <span className="flex flex-col items-center gap-2 text-[12.5px]">
                <Plus className="size-4" /> invite member
              </span>
            </button>
          )}
        </div>
      )}

      {!!data?.invitations.length && (
        <Section title="pending invitations">
          <Panel contentClassName="divide-y">
            {data.invitations.map((inv) => (
              <div
                key={inv.id}
                className="hover:bg-secondary flex items-center justify-between gap-4 px-4 py-3 transition-colors"
              >
                <div className="text-[12.5px] font-semibold">{inv.email}</div>
                <div className="flex items-center gap-2">
                  <RolePill role={inv.role} />
                  {canManage && (
                    <ConfirmButton
                      title={`Revoke invitation for ${inv.email}?`}
                      description="The invite link will stop working. You can send a new invitation later."
                      confirmLabel="Revoke"
                      size="sm"
                      disabled={revokeMut.isPending}
                      onConfirm={() => revokeMut.mutate(inv.id)}
                    >
                      Revoke
                    </ConfirmButton>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        </Section>
      )}
    </>
  );
}
