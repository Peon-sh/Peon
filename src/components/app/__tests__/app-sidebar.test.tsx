// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/servers',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ user: { name: 'Hiren', email: 'h@x.io' }, clear: vi.fn(), currentWorkspaceId: 'w1', workspaces: [] }),
  currentWorkspace: () => ({ id: 'w1', name: 'Acme', role: 'OWNER' }),
}));
vi.mock('@/lib/queries/service', () => ({ useServiceDetail: () => ({ data: undefined }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ removeQueries: vi.fn() }), useQuery: () => ({ data: [] }) }));
vi.mock('@teispace/next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme: vi.fn() }) }));
vi.mock('@/components/app/workspace-switcher', () => ({ WorkspaceSwitcher: () => <div>ws</div> }));
vi.mock('@/components/billing/sidebar-upgrade-pro', () => ({ SidebarUpgradePro: () => null }));

import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '../app-sidebar';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }),
});

describe('AppSidebar', () => {
  it('marks the current section active with the neutral pill, not an accent text color', () => {
    render(<TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider>);
    const link = screen.getByRole('link', { name: 'Servers' });
    const btn = link.closest('[data-slot="sidebar-menu-button"]')!;
    expect(btn.getAttribute('data-active')).toBe('true');
    expect(btn.className).not.toMatch(/text-phosphor|font-bold|text-\[/);
  });
  it('keeps group labels in sentence case with no tracking', () => {
    render(<TooltipProvider><SidebarProvider><AppSidebar /></SidebarProvider></TooltipProvider>);
    const label = screen.getByText('Workspace');
    expect(label.className).not.toMatch(/uppercase|tracking-/);
  });
  it('renders without overflow classes in collapsed icon mode', () => {
    const { container } = render(<TooltipProvider><SidebarProvider defaultOpen={false}><AppSidebar /></SidebarProvider></TooltipProvider>);
    expect(container.querySelector('[data-state="collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="sidebar-group-label"]')!.className).toContain('group-data-[collapsible=icon]:hidden');
  });
});
