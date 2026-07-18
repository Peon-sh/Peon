'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, FolderKanban, LayoutDashboard, List, Plus, Slash, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuthStore } from '@/store/auth';
import { listProjects } from '@/services/api/project';
import { type ServiceStatus } from '@/services/api/service';
import { useProjectServices } from '@/lib/queries/service';
import { cn } from '@/lib/utils';

const STATUS_DOT: Partial<Record<ServiceStatus, string>> = {
  RUNNING: 'bg-emerald-500',
  STARTING: 'bg-amber-500',
  DEGRADED: 'bg-red-500',
  STOPPED: 'bg-zinc-500',
  EXITED: 'bg-red-500',
};

function statusDotClass(status?: ServiceStatus) {
  return (status && STATUS_DOT[status]) ?? 'bg-zinc-500';
}

/**
 * Vercel-style top bar: sidebar trigger + Project / Service breadcrumb
 * selectors. Selecting a project or service navigates; the sidebar then
 * renders nav contextual to the selection.
 */
export function AppHeader() {
  const params = useParams<{ projectId?: string; serviceId?: string }>();
  const projectId = params?.projectId;
  const serviceId = params?.serviceId;

  return (
    <header className="bg-background z-20 flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="bg-border mx-1 h-4 w-px" />
      <nav className="flex min-w-0 flex-1 items-center gap-1">
        <ProjectSelector projectId={projectId} />
        {projectId && (
          <>
            <Slash className="text-faint size-3 shrink-0 -rotate-12" />
            <ServiceSelector projectId={projectId} serviceId={serviceId} />
          </>
        )}
      </nav>
    </header>
  );
}

function SelectorTrigger({
  label,
  placeholder,
  active,
  leading,
}: {
  label: string | null;
  placeholder: string;
  active?: boolean;
  leading?: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 max-w-56 gap-1.5 px-2 text-[13px]',
        label ? 'font-semibold' : 'text-muted-foreground font-normal',
        active && 'text-phosphor',
      )}
    >
      {leading}
      <span className="truncate">{label ?? placeholder}</span>
      <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
    </Button>
  );
}

function ProjectSelector({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const { currentWorkspaceId } = useAuthStore();
  const wsId = currentWorkspaceId ?? '';
  const [open, setOpen] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ['projects', wsId],
    queryFn: () => listProjects(wsId),
    enabled: !!wsId,
  });

  const current = projects?.find((p) => p.id === projectId);

  /** Selecting a project opens its services list — the user picks a service. */
  function selectProject(id: string) {
    setOpen(false);
    router.push(`/projects/${id}?tab=services`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <SelectorTrigger label={current?.name ?? null} placeholder="Select project" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find project…" />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup heading="Projects">
              {projects?.map((p) => (
                <CommandItem key={p.id} value={p.name} onSelect={() => selectProject(p.id)}>
                  <FolderKanban className="text-muted-foreground size-4" />
                  <span className="truncate">{p.name}</span>
                  {p.id === projectId && <Check className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {projectId && (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    router.push('/dashboard');
                  }}
                >
                  <X className="size-4" /> Deselect project
                </CommandItem>
              )}
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  router.push('/dashboard');
                }}
              >
                <LayoutDashboard className="size-4" /> Workspace dashboard
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  router.push('/projects');
                }}
              >
                <Plus className="size-4" /> View all / create project
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ServiceSelector({ projectId, serviceId }: { projectId: string; serviceId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { data: services } = useProjectServices(projectId);
  const current = services?.find((s) => s.id === serviceId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <SelectorTrigger
            label={current?.name ?? null}
            placeholder="Select service"
            active={!!current}
            leading={
              current ? (
                <span
                  className={cn('size-2 shrink-0 rounded-full', statusDotClass(current.status))}
                  title={current.status.toLowerCase()}
                />
              ) : undefined
            }
          />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find service…" />
          <CommandList>
            <CommandEmpty>No services found.</CommandEmpty>
            <CommandGroup heading="Services">
              {services?.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/projects/${projectId}/services/${s.id}`);
                  }}
                >
                  <span className={cn('size-2 rounded-full', statusDotClass(s.status))} />
                  <span className="truncate">{s.name}</span>
                  {s.id === serviceId && <Check className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {serviceId && (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/projects/${projectId}?tab=services`);
                  }}
                >
                  <X className="size-4" /> Deselect service
                </CommandItem>
              )}
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  router.push(`/projects/${projectId}?tab=services`);
                }}
              >
                <List className="size-4" /> All services / create new
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
