'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageContainer, PageHeader } from '@/components/app/page';
import { currentWorkspace } from '@/store/auth';
import { cn } from '@/lib/utils';

const SETTINGS_NAV = [
  { value: 'general', href: '/settings/general', label: 'General', ownerOnly: false },
  { value: 'members', href: '/settings/members', label: 'Members', ownerOnly: false },
  { value: 'subscription', href: '/settings/subscription', label: 'Subscription', ownerOnly: false },
  { value: 'llm', href: '/settings/llm', label: 'LLMs', ownerOnly: false },
  { value: 'audit', href: '/settings/audit', label: 'Audit log', ownerOnly: true },
  { value: 'danger', href: '/settings/danger', label: 'Danger zone', ownerOnly: false },
] as const;

function activeFromPath(pathname: string) {
  return SETTINGS_NAV.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.value ?? 'general';
}

export default function WorkspaceSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = currentWorkspace();
  const isOwner = workspace?.role === 'OWNER';
  const items = SETTINGS_NAV.filter((t) => !t.ownerOnly || isOwner);
  const active = activeFromPath(pathname);

  useEffect(() => {
    if (pathname === '/settings/audit' && workspace && !isOwner) router.replace('/settings/general');
  }, [pathname, workspace, isOwner, router]);

  return (
    <PageContainer>
      <PageHeader title="Workspace settings" description={workspace?.name} />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
          {items.map((t) => (
            <Link
              key={t.value}
              href={t.href}
              aria-current={active === t.value ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-base whitespace-nowrap transition-colors',
                active === t.value ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </PageContainer>
  );
}
