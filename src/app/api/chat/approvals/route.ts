import type { NextRequest } from 'next/server';
import { ok, route } from '@/lib/http/response';
import { requireUser } from '@/lib/auth/context';
import { chatApprovalSchema } from '@/schemas/chat.schema';
import { ChatService } from '@/services/internal/chat/chat';

/**
 * Records an approval decision server-side for audit.
 * The AI SDK client still sends the approval response via the message stream
 * using addToolApprovalResponse; this endpoint is the authoritative audit trail.
 */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const body = chatApprovalSchema.parse(await request.json());
  const updated = await ChatService.decideApproval({
    approvalId: body.approvalId,
    toolCallId: body.toolCallId,
    threadId: body.threadId,
    userId: user.id,
    approved: body.approved,
  });
  return ok({
    id: updated.id,
    approvalId: updated.approvalId,
    approvalStatus: updated.approvalStatus,
  });
});
