'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageContainer } from '@/components/app/page';
import { currentWorkspace } from '@/store/auth';

const TABS_LIST_CLASS =
  'h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0';
const TABS_TRIGGER_CLASS =
  'rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 pb-2 text-[12.5px] shadow-none data-[state=active]:border-phosphor data-[state=active]:bg-transparent data-[state=active]:text-phosphor data-[state=active]:shadow-none';

const BASE_TABS = [
  { value: 'general', href: '/settings/general', label: 'General', ownerOnly: false },
  { value: 'members', href: '/settings/members', label: 'Members', ownerOnly: false },
  { value: 'llm', href: '/settings/llm', label: 'LLMs', ownerOnly: false },
  { value: 'audit', href: '/settings/audit', label: 'Audit', ownerOnly: true },
  { value: 'danger', href: '/settings/danger', label: 'Danger', ownerOnly: false },
] as const;

function tabFromPath(pathname: string): string {
  const match = BASE_TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
  return match?.value ?? 'general';
}

export default function WorkspaceSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = currentWorkspace();
  const isOwner = workspace?.role === 'OWNER';

  const tabs = BASE_TABS.filter((tab) => !tab.ownerOnly || isOwner);
  const active = tabFromPath(pathname);

  useEffect(() => {
    if (pathname === '/settings/audit' && workspace && !isOwner) {
      router.replace('/settings/general');
    }
  }, [pathname, workspace, isOwner, router]);

  return (
    <PageContainer>
      <Tabs
        value={active}
        onValueChange={(value) => {
          const tab = BASE_TABS.find((t) => t.value === value);
          if (tab) router.push(tab.href);
        }}
        className="w-full min-w-0"
      >
        <TabsList className={TABS_LIST_CLASS}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} className={TABS_TRIGGER_CLASS} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="pt-6">{children}</div>
      </Tabs>
    </PageContainer>
  );
}
