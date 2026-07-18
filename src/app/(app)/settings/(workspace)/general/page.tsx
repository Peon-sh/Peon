'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Panel, Section } from '@/components/app/page';
import { useAuthStore } from '@/store/auth';
import { seedWorkspaceGeneralForm } from '@/lib/workspace-general-form';
import { listWorkspaces, updateWorkspace, type WorkspaceListItem } from '@/services/api/workspace';

/**
 * Mount the form only after list data is ready, keyed by workspace id.
 * Do not seed empty useState + sync via `snapshot !== current` — a warm React Query
 * cache makes that skip on remount (e.g. Members → General), leaving Name blank
 * while the sidebar still shows the auth-store name.
 */
export default function SettingsGeneralPage() {
  const role = useAuthStore((s) => {
    const id = s.currentWorkspaceId;
    return s.workspaces.find((w) => w.id === id)?.role;
  });
  const canEdit = role === 'OWNER' || role === 'ADMIN';
  const wsId = useAuthStore((s) => s.currentWorkspaceId)!;

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  const current = workspaces?.find((w) => w.id === wsId);

  return (
    <Section title="general" description="basic workspace details">
      {isLoading || !current ? (
        <Panel contentClassName="space-y-4 p-4">
          <p className="text-muted-foreground text-[12px]">Loading workspace…</p>
        </Panel>
      ) : (
        <WorkspaceGeneralForm key={current.id} workspace={current} canEdit={canEdit} />
      )}
    </Section>
  );
}

function WorkspaceGeneralForm({
  workspace,
  canEdit,
}: {
  workspace: WorkspaceListItem;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => seedWorkspaceGeneralForm(workspace).name);
  const [description, setDescription] = useState(
    () => seedWorkspaceGeneralForm(workspace).description,
  );

  const saveMut = useMutation({
    mutationFn: () =>
      updateWorkspace(workspace.id, { name: name.trim(), description: description || null }),
    onSuccess: async () => {
      const trimmed = name.trim();
      const { user, workspaces, setSession } = useAuthStore.getState();
      if (user) {
        setSession(
          user,
          workspaces.map((w) => (w.id === workspace.id ? { ...w, name: trimmed } : w)),
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workspaces'] }),
        qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
      ]);
      toast.success('Workspace updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Panel
      contentClassName="space-y-4 p-4"
      footer={
        canEdit ? (
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!name.trim() || saveMut.isPending}
          >
            Save changes
          </Button>
        ) : (
          <p className="text-muted-foreground w-full text-left text-[11px]">
            Only workspace owners and admins can edit these settings.
          </p>
        )
      }
    >
      <div className="space-y-2">
        <Label htmlFor="ws-name">Name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ws-desc">Description</Label>
        <Textarea
          id="ws-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canEdit}
        />
      </div>
    </Panel>
  );
}
