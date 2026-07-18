'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ChatAddToolApproveResponseFunction,
  DynamicToolUIPart,
  ToolUIPart,
} from 'ai';
import { getToolName } from 'ai';
import { Button } from '@/components/ui/button';
import { recordChatApproval } from '@/services/api/chat';

type ApprovalPart = Extract<
  ToolUIPart | DynamicToolUIPart,
  { state: 'approval-requested' }
>;

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '');
  return Object.entries(input as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, value]) => {
      const shown =
        key === 'value' || /secret|password|token|key/i.test(key)
          ? '[REDACTED]'
          : typeof value === 'object'
            ? '…'
            : String(value);
      return `${key}: ${shown}`;
    })
    .join(' · ');
}

export function ApprovalCard({
  part,
  threadId,
  addToolApprovalResponse,
}: {
  part: ApprovalPart;
  threadId: string;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  const [pending, setPending] = useState(false);

  if (part.approval.isAutomatic) return null;

  async function decide(approved: boolean) {
    setPending(true);
    try {
      await recordChatApproval({
        approvalId: part.approval.id,
        toolCallId: part.toolCallId,
        threadId,
        approved,
      });
      await addToolApprovalResponse({ id: part.approval.id, approved });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record approval');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-warning/40 bg-warning/5 overflow-hidden rounded-md border">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium">
        <ShieldAlert className="text-warning size-4 shrink-0" />
        <span>
          Approve <span className="font-mono">{getToolName(part)}</span>?
        </span>
      </div>
      <p className="text-muted-foreground truncate border-y px-3 py-2 font-mono text-[11px]">
        {summarizeInput(part.input)}
      </p>
      <div className="flex justify-end gap-2 p-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => void decide(false)}>
          Deny
        </Button>
        <Button size="sm" disabled={pending} onClick={() => void decide(true)}>
          Approve
        </Button>
      </div>
    </div>
  );
}
