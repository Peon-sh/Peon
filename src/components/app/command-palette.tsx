'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Server,
  GitBranch,
  Database,
  Bell,
  KeyRound,
  Users,
  Settings,
  MessageSquare,
  Brain,
  BookOpen,
  Variable,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

const COMMANDS = [
  { label: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { label: 'Chat', url: '/chat', icon: MessageSquare },
  { label: 'User manual (ask in Chat)', url: '/chat', icon: BookOpen },
  { label: 'Projects', url: '/projects', icon: FolderKanban },
  { label: 'Servers', url: '/servers', icon: Server },
  { label: 'Sources', url: '/sources', icon: GitBranch },
  { label: 'Storages', url: '/storages', icon: Database },
  { label: 'Notifications', url: '/notifications', icon: Bell },
  { label: 'Keys & Tokens', url: '/keys-and-tokens', icon: KeyRound },
  { label: 'Shared variables', url: '/shared-variables', icon: Variable },
  { label: 'Settings', url: '/settings/general', icon: Settings },
  { label: 'Members', url: '/settings/members', icon: Users },
  { label: 'LLM settings', url: '/settings/llm', icon: Brain },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const openEvent = () => setOpen(true);
    document.addEventListener('keydown', down);
    window.addEventListener('open-command-palette', openEvent);
    return () => {
      document.removeEventListener('keydown', down);
      window.removeEventListener('open-command-palette', openEvent);
    };
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {COMMANDS.map((c) => (
            <CommandItem
              key={`${c.label}:${c.url}`}
              value={c.label}
              onSelect={() => {
                setOpen(false);
                router.push(c.url);
              }}
            >
              <c.icon className="size-4" />
              {c.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
