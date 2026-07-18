'use client';

import { Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app/app-sidebar';
import { AppHeader } from '@/components/app/app-header';
import { CommandPalette } from '@/components/app/command-palette';
import { BottomRightNotices } from '@/components/app/bottom-right-notices';
import { useAuthStore } from '@/store/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();

  // While the auth store hydrates, render a minimal shell.
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <SidebarProvider className="!h-svh !max-h-svh !min-h-0 overflow-hidden">
      <CommandPalette />
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <SidebarInset className="min-h-0 min-w-0 max-h-svh overflow-hidden">
        <Suspense fallback={null}>
          <AppHeader />
        </Suspense>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-6">
          {children}
        </div>
      </SidebarInset>
      <BottomRightNotices />
    </SidebarProvider>
  );
}
