import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { takeRecentMessages } from '../message-window';

function msg(id: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text: id }] };
}

describe('takeRecentMessages', () => {
  it('returns all messages when under the limit', () => {
    const messages = [msg('1'), msg('2')];
    expect(takeRecentMessages(messages, 10)).toEqual(messages);
  });

  it('keeps only the last N messages', () => {
    const messages = Array.from({ length: 15 }, (_, index) => msg(String(index + 1)));
    const recent = takeRecentMessages(messages, 10);
    expect(recent).toHaveLength(10);
    expect(recent[0]?.id).toBe('6');
    expect(recent.at(-1)?.id).toBe('15');
  });
});
