import type { UIMessage } from 'ai';

/** How many messages the UI shows initially / loads per scroll page. */
export const CHAT_MESSAGE_PAGE_SIZE = 10;

/** How many recent messages are sent to the model as conversation context. */
export const CHAT_CONTEXT_MESSAGE_LIMIT = 10;

/** Return the most recent `limit` messages (chronological order preserved). */
export function takeRecentMessages(
  messages: UIMessage[],
  limit: number = CHAT_CONTEXT_MESSAGE_LIMIT,
): UIMessage[] {
  if (limit <= 0 || messages.length <= limit) return messages;
  return messages.slice(-limit);
}
