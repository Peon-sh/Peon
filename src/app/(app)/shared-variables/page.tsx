'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/app/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField, PageContainer, PageHeader } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm';
import { useAuthStore } from '@/store/auth';
import {
  listSharedVariables,
  createSharedVariable,
  deleteSharedVariable,
  type SharedVariableScope,
} from '@/services/api/shared-variables';

const SCOPES: SharedVariableScope[] = ['WORKSPACE', 'PROJECT', 'SERVER'];
const SCOPE_LABEL: Record<SharedVariableScope, string> = {
  WORKSPACE: 'Workspace',
  PROJECT: 'Project',
  SERVER: 'Server',
};
const MODAL_FIELD = 'lg:grid-cols-1 lg:gap-2';

export default function SharedVariablesPage() {
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId!;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SharedVariableScope>('WORKSPACE');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [comment, setComment] = useState('');
  const [projectId, setProjectId] = useState('');
  const [serverId, setServerId] = useState('');

  const { data: vars, isLoading } = useQuery({
    queryKey: ['shared-vars', wsId],
    queryFn: () => listSharedVariables(wsId),
    enabled: !!wsId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['shared-vars', wsId] });

  const reset = () => {
    setScope('WORKSPACE');
    setKey('');
    setValue('');
    setComment('');
    setProjectId('');
    setServerId('');
  };

  const createMut = useMutation({
    mutationFn: () =>
      createSharedVariable(wsId, {
        scope,
        key,
        value,
        comment: comment || null,
        projectId: scope === 'PROJECT' ? projectId : null,
        serverId: scope === 'SERVER' ? serverId : null,
      }),
    onSuccess: async () => {
      await invalidate();
      setOpen(false);
      reset();
      toast.success('Variable created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSharedVariable(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Variable deleted');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const createDialog = (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Add shared variable</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <FormField label="Scope" className={MODAL_FIELD}>
            <Select value={scope} onValueChange={(v) => setScope(v as SharedVariableScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCOPE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {scope === 'PROJECT' && (
            <FormField label="Project ID" htmlFor="sv-project" className={MODAL_FIELD}>
              <Input
                id="sv-project"
                className="font-mono"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            </FormField>
          )}
          {scope === 'SERVER' && (
            <FormField label="Server ID" htmlFor="sv-server" className={MODAL_FIELD}>
              <Input
                id="sv-server"
                className="font-mono"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
              />
            </FormField>
          )}
          <FormField label="Key" htmlFor="sv-key" className={MODAL_FIELD}>
            <Input id="sv-key" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
          </FormField>
          <FormField label="Value" htmlFor="sv-value" className={MODAL_FIELD}>
            <Textarea
              id="sv-value"
              className="font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </FormField>
          <FormField label="Comment" htmlFor="sv-comment" className={MODAL_FIELD}>
            <Input
              id="sv-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!key || !value || createMut.isPending}
          >
            Add variable
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Add variable
    </Button>
  );

  return (
    <PageContainer>
      {createDialog}
      <PageHeader
        title="Shared variables"
        description="Values available to every service in the workspace"
        actions={addButton}
      />

      <DataTable
        columns={[
          {
            key: 'key',
            header: 'Key',
            cell: (v) => (
              <div className="min-w-0">
                <div className="font-mono font-medium">{v.key}</div>
                {v.comment && (
                  <div className="text-muted-foreground max-w-64 truncate text-sm">{v.comment}</div>
                )}
              </div>
            ),
          },
          {
            key: 'value',
            header: 'Value',
            cell: () => <span className="text-muted-foreground font-mono">••••••••</span>,
          },
          {
            key: 'scope',
            header: 'Scope',
            cell: (v) => <Badge variant="outline">{SCOPE_LABEL[v.scope] ?? v.scope}</Badge>,
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (v) => (
              <ConfirmButton
                title={`Delete shared variable "${v.key}"?`}
                description="Services that inherit this variable will no longer receive it on the next deploy."
                confirmLabel="Delete"
                variant="ghost"
                disabled={deleteMut.isPending}
                onConfirm={() => deleteMut.mutate(v.id)}
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            ),
          },
        ]}
        rows={vars ?? []}
        rowKey={(v) => v.id}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={KeyRound}
            title="No shared variables yet"
            description="Create variables to share across your services, projects, or servers."
            action={addButton}
          />
        }
      />
    </PageContainer>
  );
}
