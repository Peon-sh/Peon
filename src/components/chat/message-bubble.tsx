'use client';

import { memo, useState } from 'react';
import {
  getToolName,
  isToolUIPart,
  type ChatAddToolApproveResponseFunction,
  type ReasoningUIPart,
  type UIMessage,
  type UIMessagePart,
} from 'ai';
import { Brain, Check, Copy, LoaderCircle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { ApprovalCard } from '@/components/chat/approval-card';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { ReasoningPanel } from '@/components/chat/reasoning-panel';
import { ToolCard, type AnyToolPart } from '@/components/chat/tool-card';
import { VisualBlock } from '@/components/chat/visual-block';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { parseChatVisual, type ChatVisual } from '@/services/internal/chat/visuals';
import { formatLocalDateTime, parseApiDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';

type PeonMessageMeta = { createdAt?: string };

const TOOL_DONE = new Set(['output-available', 'output-error', 'output-denied']);

function visualFromPart(part: UIMessagePart<Record<string, unknown>, Record<string, never>>) {
  const candidate = part as unknown as Record<string, unknown>;
  if (
    candidate.type === 'data-visual' ||
    candidate.type === 'visual' ||
    candidate.kind === 'visual'
  ) {
    return parseChatVisual(candidate.data ?? candidate.value);
  }
  return null;
}

function formatChatTime(iso?: string): string | null {
  if (!iso || !parseApiDate(iso)) return null;
  return formatLocalDateTime(iso, 'datetime');
}

function plainTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
}

/** One continuous status line for the whole agent turn while the stream is active. */
function LiveStatus({
  reasoningParts,
  toolParts,
}: {
  reasoningParts: ReasoningUIPart[];
  toolParts: AnyToolPart[];
}) {
  const thinking = reasoningParts.some((part) => part.state !== 'done');
  const pendingTool = [...toolParts]
    .reverse()
    .find((part) => !TOOL_DONE.has(part.state));
  const done = toolParts.filter((part) => TOOL_DONE.has(part.state)).length;

  let label: string;
  let icon: 'brain' | 'tool' | 'spin';

  if (thinking) {
    label = 'Thinking…';
    icon = 'brain';
  } else if (pendingTool) {
    label = `Calling ${getToolName(pendingTool)}…`;
    icon = 'tool';
  } else {
    label = 'Working…';
    icon = 'spin';
  }

  return (
    <div
      className="text-muted-foreground flex items-center gap-2 text-[11px]"
      aria-live="polite"
      aria-label={label}
    >
      {icon === 'brain' && <Brain className="text-phosphor size-3.5 animate-pulse" />}
      {icon === 'tool' && <Wrench className="text-phosphor size-3.5 animate-pulse" />}
      {icon === 'spin' && <LoaderCircle className="text-phosphor size-3.5 animate-spin" />}
      <span className={cn(icon === 'tool' && 'font-mono')}>{label}</span>
      {toolParts.length > 0 && (
        <span className="text-faint tabular-nums">
          {done}/{toolParts.length}
        </span>
      )}
      <span className="ml-0.5 flex items-center gap-1" aria-hidden>
        <span className="bg-muted-foreground/60 size-1 animate-bounce rounded-full [animation-delay:-0.3s]" />
        <span className="bg-muted-foreground/60 size-1 animate-bounce rounded-full [animation-delay:-0.15s]" />
        <span className="bg-muted-foreground/60 size-1 animate-bounce rounded-full" />
      </span>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  awaitingFirstToken,
  threadId,
  addToolApprovalResponse,
}: {
  message: UIMessage;
  streaming: boolean;
  awaitingFirstToken?: boolean;
  threadId: string;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const meta = message.metadata as PeonMessageMeta | undefined;
  const timeLabel = formatChatTime(meta?.createdAt);
  const complete = !streaming && !awaitingFirstToken;

  const reasoningParts = message.parts.filter(
    (part): part is ReasoningUIPart => part.type === 'reasoning',
  );
  const toolParts = message.parts.filter(isToolUIPart) as AnyToolPart[];
  const approvalParts = toolParts.filter(
    (part) => part.state === 'approval-requested' && !part.approval.isAutomatic,
  );
  const nonApprovalTools = toolParts.filter(
    (part) => !(part.state === 'approval-requested' && !part.approval.isAutomatic),
  );
  const contentParts = message.parts.filter((part) => {
    if (part.type === 'reasoning' || isToolUIPart(part)) return false;
    return part.type === 'text' || !!visualFromPart(part as never);
  });
  const answerText = plainTextFromMessage(message);
  const hasAnswer = answerText.length > 0;
  const showLiveStatus = !isUser && (streaming || !!awaitingFirstToken);
  const showBrain =
    !isUser &&
    complete &&
    (reasoningParts.length > 0 || nonApprovalTools.length > 0);
  const showAssistantMeta = !isUser && complete && hasAnswer;
  const showUserTime = isUser && !!timeLabel;
  const showAssistantTime = showAssistantMeta && !!timeLabel;

  async function copyAnswer() {
    if (!answerText) return;
    try {
      await navigator.clipboard.writeText(answerText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy response');
    }
  }

  return (
    <article
      className={cn(
        'flex w-full flex-col gap-1.5',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'min-w-0 space-y-2 text-sm leading-relaxed select-text',
          isUser
            ? 'bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 selection:bg-black/35 selection:text-primary-foreground'
            : 'w-full max-w-3xl selection:bg-phosphor/40 selection:text-foreground',
        )}
      >
        {showLiveStatus && !hasAnswer && (
          <LiveStatus reasoningParts={reasoningParts} toolParts={toolParts} />
        )}

        {approvalParts.map((part) => (
          <ApprovalCard
            key={part.toolCallId}
            part={part as Extract<AnyToolPart, { state: 'approval-requested' }>}
            threadId={threadId}
            addToolApprovalResponse={addToolApprovalResponse}
          />
        ))}

        {contentParts.map((part, index) => {
          const visual = visualFromPart(part as never) as ChatVisual | null;
          if (visual) {
            const partId =
              typeof (part as { id?: unknown }).id === 'string'
                ? (part as { id: string }).id
                : `v-${index}`;
            return (
              <VisualBlock
                key={partId}
                visual={visual}
                deferHeavy={streaming || !!awaitingFirstToken}
              />
            );
          }
          if (part.type === 'text') {
            return <MarkdownMessage key={`t-${index}`}>{part.text}</MarkdownMessage>;
          }
          return null;
        })}

        {showLiveStatus && hasAnswer && (
          <LiveStatus reasoningParts={reasoningParts} toolParts={toolParts} />
        )}

        {showBrain && detailsOpen && (
          <div className="space-y-2 rounded-md border p-2">
            {reasoningParts.map((part, index) => (
              <ReasoningPanel
                key={`r-${index}`}
                part={part}
                streaming={false}
                defaultOpen={index === 0}
              />
            ))}
            {nonApprovalTools.map((part) => (
              <ToolCard key={part.toolCallId} part={part} compact />
            ))}
          </div>
        )}
      </div>

      {(showUserTime || showAssistantMeta) && (
        <div
          className={cn(
            'text-faint flex items-center gap-0.5 px-0.5',
            isUser ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {showAssistantMeta && (
            <TooltipProvider>
              {showBrain && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        'text-muted-foreground hover:text-foreground',
                        detailsOpen && 'bg-muted text-foreground',
                      )}
                      onClick={() => setDetailsOpen((value) => !value)}
                      aria-label={detailsOpen ? 'Hide agent details' : 'Show agent details'}
                    >
                      <Brain className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {detailsOpen ? 'Hide thinking & tools' : 'Show thinking & tools'}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => void copyAnswer()}
                    aria-label={copied ? 'Copied' : 'Copy response'}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{copied ? 'Copied' : 'Copy'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {(showUserTime || showAssistantTime) && (
            <time dateTime={meta?.createdAt} className="px-1.5 text-[10px] tabular-nums">
              {timeLabel}
            </time>
          )}
        </div>
      )}
    </article>
  );
}, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.streaming === next.streaming &&
    prev.awaitingFirstToken === next.awaitingFirstToken &&
    prev.threadId === next.threadId
  );
});
