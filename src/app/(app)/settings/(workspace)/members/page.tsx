'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormField, Panel } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
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
const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  ADMIN: 'Admin',
  BILLING_ADMIN: 'Billing admin',
  MEMBER: 'Member',
};
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

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
            <FormField label="Email" htmlFor="email" className="lg:grid-cols-1 lg:gap-2">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </FormField>
            <FormField label="Role" className="lg:grid-cols-1 lg:gap-2">
              <SearchableSelect
                value={role}
                onValueChange={setRole}
                placeholder="Select role"
                options={ROLE_OPTIONS}
              />
            </FormField>
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

  const inviteButton = canManage ? (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Invite member
    </Button>
  ) : undefined;

  return (
    <>
      {inviteDialog}

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-md font-medium">Members</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">People with access to this workspace</p>
        </div>
        {inviteButton}
      </div>

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Name',
            cell: (m) => <span className="font-medium">{m.user.name ?? m.user.email}</span>,
          },
          {
            key: 'email',
            header: 'Email',
            cell: (m) => <span className="text-muted-foreground font-mono">{m.user.email}</span>,
          },
          { key: 'role', header: 'Role', cell: (m) => <RolePill role={m.role} /> },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (m) =>
              m.role === 'OWNER' ? (
                <span className="text-muted-foreground text-sm">Transfer ownership in Danger zone</span>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <SearchableSelect
                    value={m.role}
                    onValueChange={(r) => roleMut.mutate({ userId: m.user.id, role: r })}
                    placeholder="Select role"
                    size="sm"
                    className="w-36"
                    disabled={!canManage || roleMut.isPending}
                    options={ROLE_OPTIONS}
                  />
                  {canManage && m.user.id !== user?.id && (
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
              ),
          },
        ]}
        rows={data?.members ?? []}
        rowKey={(m) => m.id}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={Users}
            title="No members yet"
            description="Invite teammates to collaborate in this workspace."
            action={inviteButton}
          />
        }
      />

      {!!data?.invitations.length && (
        <Panel title="Pending invitations" padded={false}>
          <div className="divide-y">
            {data.invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 truncate font-mono text-base">{inv.email}</div>
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
          </div>
        </Panel>
      )}
    </>
  );
}
