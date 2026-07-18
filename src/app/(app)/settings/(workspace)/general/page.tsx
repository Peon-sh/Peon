'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Panel, Section } from '@/components/app/page';
import { currentWorkspace, useAuthStore } from '@/store/auth';
import { listWorkspaces, updateWorkspace } from '@/services/api/workspace';

export default function SettingsGeneralPage() {
  const workspace = currentWorkspace();
  const canEdit = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  const current = workspaces?.find((w) => w.id === wsId);
  const [snapshot, setSnapshot] = useState(current);

  if (current && snapshot !== current) {
    setSnapshot(current);
    setName(current.name);
    setDescription(current.description ?? '');
  }

  const saveMut = useMutation({
    mutationFn: () => updateWorkspace(wsId, { name, description: description || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Section title="general" description="basic workspace details">
      <Panel
        contentClassName="space-y-4 p-4"
        footer={
          canEdit ? (
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={!name || saveMut.isPending}>
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
    </Section>
  );
}
