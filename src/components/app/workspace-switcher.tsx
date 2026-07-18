'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useAuthStore } from '@/store/auth';
import { createWorkspace } from '@/services/api/workspace';

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspaceId, setCurrentWorkspace } = useAuthStore();
  const current = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const router = useRouter();
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => createWorkspace({ name }),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      setCurrentWorkspace(ws.id);
      setOpen(false);
      setName('');
      toast.success('Workspace created');
      router.refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            className="h-9 hover:bg-transparent active:bg-transparent data-[state=open]:bg-transparent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
            tooltip={current?.name ?? 'Workspace'}
          >
            <span className="border-border-bright bg-secondary text-phosphor grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-bold">
              {(current?.name ?? 'W')[0].toUpperCase()}
            </span>
            <div className="grid flex-1 text-left leading-none group-data-[collapsible=icon]:hidden">
              <span className="font-heading truncate text-[11px] font-extrabold">
                {current?.name ?? 'Workspace'}
              </span>
              <span className="text-muted-foreground truncate text-[9px] lowercase tracking-wide">
                {current?.role?.toLowerCase()}
              </span>
            </div>
            <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel className="text-muted-foreground text-xs">Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onClick={() => {
                setCurrentWorkspace(w.id);
                // Selected project/service belong to the old workspace: leave
                // that context and land on the workspace dashboard.
                router.push('/dashboard');
                router.refresh();
              }}
            >
              <span className="border-border-bright bg-secondary text-phosphor grid size-5 shrink-0 place-items-center rounded border text-[10px] font-bold">
                {w.name[0].toUpperCase()}
              </span>
              <span className="truncate">{w.name}</span>
              {w.id === current?.id && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <ModalTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Plus className="size-4" /> Create workspace
            </DropdownMenuItem>
          </ModalTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModalContent>
        <ModalHeader>
          <ModalTitle>Create workspace</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-2">
          <Label htmlFor="ws-name">Name</Label>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            Create
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
