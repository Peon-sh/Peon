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
  ModalTrigger,
} from '@/components/app/modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageContainer, PageHeader, Panel } from '@/components/app/page';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const HEAD_CLASS =
  'text-faint h-9 px-4 text-[11px] font-medium uppercase tracking-[0.12em]';
import {
  listSharedVariables,
  createSharedVariable,
  deleteSharedVariable,
  type SharedVariableScope,
} from '@/services/api/shared-variables';

const SCOPES: SharedVariableScope[] = ['WORKSPACE', 'PROJECT', 'SERVER'];

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
      <ModalTrigger asChild>
        <Button>
          <Plus className="size-4" /> New variable
        </Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create shared variable</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as SharedVariableScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === 'PROJECT' && (
            <div className="space-y-2">
              <Label htmlFor="sv-project">Project ID</Label>
              <Input
                id="sv-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            </div>
          )}
          {scope === 'SERVER' && (
            <div className="space-y-2">
              <Label htmlFor="sv-server">Server ID</Label>
              <Input
                id="sv-server"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sv-key">Key</Label>
            <Input id="sv-key" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sv-value">Value</Label>
            <Textarea id="sv-value" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sv-comment">Comment</Label>
            <Input
              id="sv-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!key || !value || createMut.isPending}
          >
            Create
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );

  return (
    <PageContainer>
      <PageHeader actions={createDialog} />

      {isLoading ? (
        <div className="bg-accent h-48 animate-pulse rounded-lg" />
      ) : !vars?.length ? (
        <EmptyState
          icon={KeyRound}
          title="No shared variables yet"
          description="create variables to share across your services, projects, or servers."
          action={createDialog}
        />
      ) : (
        <Panel title="variables">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>key</TableHead>
                <TableHead className={HEAD_CLASS}>value</TableHead>
                <TableHead className={HEAD_CLASS}>scope</TableHead>
                <TableHead className={cn(HEAD_CLASS, 'text-right')}>actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vars.map((v) => (
                <TableRow key={v.id} className="hover:bg-secondary">
                  <TableCell className="px-4 py-3">
                    <div className="text-[12.5px] font-semibold">{v.key}</div>
                    {v.comment && (
                      <div className="text-muted-foreground max-w-64 truncate text-[11px]">
                        {v.comment}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="text-muted-foreground tracking-[0.18em]">••••••••</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant="outline" className="text-[11px] lowercase">
                      {v.scope}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <ConfirmButton
                      title={`Delete shared variable "${v.key}"?`}
                      description="Services that inherit this variable will no longer receive it on the next deploy."
                      confirmLabel="Delete"
                      size="sm"
                      disabled={deleteMut.isPending}
                      onConfirm={() => deleteMut.mutate(v.id)}
                    >
                      <Trash2 className="size-4" /> Delete
                    </ConfirmButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </PageContainer>
  );
}
