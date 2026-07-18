'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LogOut,
  Boxes,
  Moon,
  Sun,
  Server,
  LayoutDashboard,
  FolderKanban,
  Database,
  KeyRound,
  GitBranch,
  Bell,
  Users,
  Settings,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@teispace/next-themes';
import { useQueryClient } from '@tanstack/react-query';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { WorkspaceSwitcher } from '@/components/app/workspace-switcher';
import { useAuthStore } from '@/store/auth';
import { logout } from '@/services/api/auth';
import { sectionsForService } from '@/lib/service-sections';
import { useServiceDetail } from '@/lib/queries/service';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  /** Exact match on pathname + query instead of prefix match. */
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
      { title: 'Chat', url: '/chat', icon: MessageSquare },
      { title: 'Projects', url: '/projects', icon: FolderKanban },
    ],
  },
  {
    label: 'Workspace settings',
    items: [
      { title: 'Servers', url: '/servers', icon: Server },
      { title: 'Storages', url: '/storages', icon: Database },
      { title: 'Keys & Tokens', url: '/keys-and-tokens', icon: KeyRound },
      { title: 'Git Sources', url: '/sources', icon: GitBranch },
      { title: 'Notifications', url: '/notifications', icon: Bell },
      { title: 'Settings', url: '/settings/general', icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ projectId?: string; serviceId?: string }>();
  const projectId = params?.projectId;
  const serviceId = params?.serviceId;
  const { user, clear } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Service context: load the service to build kind-aware section nav.
  const { data: svc } = useServiceDetail(serviceId);

  const serviceContext = !!serviceId && !!projectId;
  const projectContext = !!projectId && !serviceId;

  const projectGroup: NavGroup | null = projectId
    ? {
        label: 'Project',
        items: [
          {
            title: 'Services',
            url: `/projects/${projectId}?tab=services`,
            icon: Boxes,
            exact: true,
          },
          {
            title: 'Members',
            url: `/projects/${projectId}?tab=members`,
            icon: Users,
            exact: true,
          },
          {
            title: 'Settings',
            url: `/projects/${projectId}?tab=settings`,
            icon: Settings,
            exact: true,
          },
        ],
      }
    : null;

  let groups: NavGroup[];
  if (serviceContext) {
    const serviceBase = `/projects/${projectId}/services/${serviceId}`;
    groups = [
      {
        label: svc ? svc.name : 'Service',
        items: sectionsForService(svc ?? { kind: 'GIT_APP', databaseEngine: null }).map((s) => ({
          title: s.label,
          url: s.id === 'overview' ? serviceBase : `${serviceBase}?section=${s.id}`,
          icon: s.icon,
          danger: s.danger,
          exact: true,
        })),
      },
      ...(projectGroup ? [projectGroup] : []),
    ];
  } else if (projectContext && projectGroup) {
    groups = [projectGroup];
  } else {
    groups = NAV_GROUPS;
  }

  /**
   * Contextual items carry query params (?section=, ?tab=) and need exact
   * pathname+query matching; workspace items keep prefix matching.
   */
  function isActive(item: NavItem) {
    if (item.exact) {
      const [itemPath, itemQuery] = item.url.split('?');
      const itemSearch = new URLSearchParams(itemQuery ?? '');
      // Deployment detail pages live under a subroute of the service; keep
      // the Deployments item highlighted there.
      if (
        itemSearch.get('section') === 'deployments' &&
        pathname.startsWith(`${itemPath}/deployments/`)
      ) {
        return true;
      }
      if (pathname !== itemPath) return false;
      const section = searchParams.get('section') ?? 'overview';
      const tab = searchParams.get('tab');
      if (itemSearch.has('tab')) {
        return (itemSearch.get('tab') ?? 'services') === (tab ?? 'services');
      }
      return (itemSearch.get('section') ?? 'overview') === section;
    }
    return item.url === '/settings/general'
      ? pathname === '/settings' ||
          (pathname.startsWith('/settings/') &&
            !pathname.startsWith('/settings/instance'))
      : pathname.startsWith(item.url);
  }

  async function onLogout() {
    try {
      await logout();
    } finally {
      clear();
      qc.removeQueries({ queryKey: ['auth', 'me'] });
      toast.success('Signed out');
      router.replace('/login');
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 justify-center border-b group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-1">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <WorkspaceSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-faint truncate text-[11px] font-medium tracking-[0.14em] uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={cn(
                          'text-muted-foreground text-[13.5px] font-semibold',
                          item.danger
                            ? 'hover:text-destructive data-[active=true]:text-destructive data-[active=true]:bg-destructive/10 border border-transparent'
                            : 'data-[active=true]:text-phosphor data-[active=true]:border-border data-[active=true]:bg-sidebar-accent data-[active=true]:font-bold border border-transparent',
                        )}
                      >
                        <Link href={item.url}>
                          <item.icon className="size-4 shrink-0" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip={user?.name ?? 'Profile'}
                  className="h-9 hover:bg-transparent active:bg-transparent data-[state=open]:bg-transparent"
                >
                  <Avatar className="border-border-bright size-6 rounded-full border">
                    <AvatarImage src={user?.profilePicture ?? undefined} />
                    <AvatarFallback className="text-phosphor rounded-full text-[10px] font-bold">
                      {(user?.name ?? user?.email ?? 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-[13px] font-semibold">
                    {user?.name ?? user?.email ?? 'User'}
                  </span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <Boxes className="size-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                {user?.isInstanceOwner && (
                  <DropdownMenuItem asChild>
                    <Link href="/profile/instance">
                      <Server className="size-4" /> Instance settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTheme(isDark ? 'light' : 'dark');
                  }}
                >
                  <span suppressHydrationWarning className="flex items-center gap-2">
                    {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    {isDark ? 'Light mode' : 'Dark mode'}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
