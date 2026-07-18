'use client';

import { Suspense } from 'react';
import { ChatShell } from '@/components/chat/chat-shell';

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="bg-card min-h-[calc(100svh-6rem)] animate-pulse rounded-lg border" />}>
      <ChatShell />
    </Suspense>
  );
}
