'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Panel } from '@/components/app/page';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import {
  deleteWorkspace,
  leaveWorkspace,
  transferWorkspaceOwnership,
  getWorkspaceDeletePreflight,
  getWorkspaceMembers,
} from '@/services/api/workspace';
import { getMe } from '@/services/api/auth';

async function refreshSessionAfterWorkspaceExit(
  setSession: ReturnType<typeof useAuthStore.getState>['setSession'],
  setCurrentWorkspace: ReturnType<typeof useAuthStore.getState>['setCurrentWorkspace'],
  router: ReturnType<typeof useRouter>,
) {
  const me = await getMe();
  setSession(me.user, me.workspaces);
  const next = me.workspaces[0];
  if (next) {
    setCurrentWorkspace(next.id);
    router.push('/projects');
  } else {
    router.push('/dashboard');
  }
}

export default function SettingsDangerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { currentWorkspaceId, setSession, setCurrentWorkspace, user } = useAuthStore();
  const workspace = currentWorkspace();
  const wsId = currentWorkspaceId!;
  const isOwner = workspace?.role === 'OWNER';
  const canLeave = !!workspace && workspace.role !== 'OWNER' && !workspace.personal;

  const [transferOpen, setTransferOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [disposition, setDisposition] = useState<'ADMIN' | 'MEMBER' | 'LEAVE'>('ADMIN');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const { data: membersData } = useQuery({
    queryKey: ['ws-members', wsId],
    queryFn: () => getWorkspaceMembers(wsId),
    enabled: !!wsId && isOwner,
  });

  const { data: preflight, refetch: refetchPreflight } = useQuery({
    queryKey: ['ws-delete-preflight', wsId],
    queryFn: () => getWorkspaceDeletePreflight(wsId),
    enabled: !!wsId && isOwner && deleteOpen,
  });

  const transferTargets =
    membersData?.members.filter((m) => m.user.id !== user?.id && m.role !== 'OWNER') ?? [];

  const leaveMut = useMutation({
    mutationFn: () => leaveWorkspace(wsId),
    onSuccess: async () => {
      toast.success('Left workspace');
      await refreshSessionAfterWorkspaceExit(setSession, setCurrentWorkspace, router);
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const transferMut = useMutation({
    mutationFn: () =>
      transferWorkspaceOwnership(wsId, {
        targetUserId,
        formerOwnerDisposition: disposition,
      }),
    onSuccess: async () => {
      toast.success('Ownership transferred');
      setTransferOpen(false);
      if (disposition === 'LEAVE') {
        await refreshSessionAfterWorkspaceExit(setSession, setCurrentWorkspace, router);
      } else {
        await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
        const me = await getMe();
        setSession(me.user, me.workspaces);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteWorkspace(wsId),
    onSuccess: async () => {
      toast.success('Workspace deleted');
      setDeleteOpen(false);
      await refreshSessionAfterWorkspaceExit(setSession, setCurrentWorkspace, router);
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="space-y-6">
      {isOwner ? (
        <Panel
          title="Transfer ownership"
          contentClassName="space-y-3 p-4"
          footer={
            <Button size="sm" onClick={() => setTransferOpen(true)}>
              Transfer ownership
            </Button>
          }
        >
          <p className="text-muted-foreground text-[12px]">
            Move ownership to another member. You can stay as admin/member or leave.
          </p>
        </Panel>
      ) : null}

      {canLeave ? (
        <Panel
          title="Leave workspace"
          contentClassName="space-y-3 p-4"
          footer={
            <Button
              size="sm"
              variant="outline"
              disabled={leaveMut.isPending}
              onClick={() => leaveMut.mutate()}
            >
              Leave workspace
            </Button>
          }
        >
          <p className="text-muted-foreground text-[12px]">
            Remove yourself from this workspace and its projects.
          </p>
        </Panel>
      ) : null}

      {isOwner ? (
        <Panel
          title={<span className="text-destructive">Delete workspace</span>}
          className="border-destructive/40"
          contentClassName="space-y-3 p-4"
          footer={
            workspace?.personal ? undefined : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setDeleteOpen(true);
                  void refetchPreflight();
                }}
              >
                Delete workspace
              </Button>
            )
          }
        >
          {workspace?.personal ? (
            <p className="text-muted-foreground text-[12px]">
              Personal workspaces cannot be deleted. Create a team workspace (or transfer to one) if
              you need a deletable workspace.
            </p>
          ) : (
            <p className="text-muted-foreground text-[12px]">
              Permanently delete this workspace after all projects and services are removed. No
              remote servers are torn down.
            </p>
          )}
        </Panel>
      ) : null}

      {!isOwner && !canLeave ? (
        <p className="text-muted-foreground text-[12px]">
          No danger-zone actions are available for your role in this workspace.
        </p>
      ) : null}

      <Modal open={transferOpen} onOpenChange={setTransferOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Transfer ownership</ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <ModalDescription>
              Choose a current member. Ownership cannot be invited — only transferred.
            </ModalDescription>
            <div className="space-y-2">
              <Label>New owner</Label>
              <SearchableSelect
                value={targetUserId}
                onValueChange={setTargetUserId}
                placeholder="Select member"
                options={transferTargets.map((m) => ({
                  value: m.user.id,
                  label: `${m.user.name ?? m.user.email} (${m.role})`,
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Your role after transfer</Label>
              <SearchableSelect
                value={disposition}
                onValueChange={(v) => setDisposition(v as 'ADMIN' | 'MEMBER' | 'LEAVE')}
                placeholder="Select disposition"
                options={[
                  { value: 'ADMIN', label: 'Stay as ADMIN' },
                  { value: 'MEMBER', label: 'Stay as MEMBER' },
                  { value: 'LEAVE', label: 'Leave workspace' },
                ]}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!targetUserId || transferMut.isPending}
              onClick={() => transferMut.mutate()}
            >
              Transfer
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setConfirmName('');
        }}
      >
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Delete workspace?</ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {preflight && !preflight.canDelete ? (
              <div className="space-y-3">
                <ModalDescription>
                  Remove these projects and services first. Delete is blocked until the workspace is
                  empty.
                </ModalDescription>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-[12px]">
                  {preflight.projects.map((p) => (
                    <li key={p.id}>
                      <span className="font-semibold">{p.name}</span>
                      {p.services.length ? (
                        <ul className="text-muted-foreground ml-3 list-disc">
                          {p.services.map((s) => (
                            <li key={s.id}>{s.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground"> (no services)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <ModalDescription>
                  This permanently deletes the workspace from Peon (database only). Type the
                  workspace name to confirm.
                </ModalDescription>
                <div className="space-y-2">
                  <Label>Workspace name</Label>
                  <Input
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={workspace?.name}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !preflight?.canDelete ||
                confirmName.trim() !== workspace?.name ||
                deleteMut.isPending
              }
              onClick={() => deleteMut.mutate()}
            >
              Delete workspace
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
