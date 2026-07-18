import { redactText, redactValue } from '@/lib/mcp/catalog/redact';
import type { UIMessage } from 'ai';

/** Redact secrets from persisted UI message parts (text, reasoning, tool I/O). */
export function redactUiMessageParts(parts: UIMessage['parts']): UIMessage['parts'] {
  return parts.map((part) => {
    if (part.type === 'text' && 'text' in part) {
      return { ...part, text: redactText(part.text) };
    }
    if (part.type === 'reasoning' && 'text' in part) {
      return { ...part, text: redactText(part.text) };
    }
    if (part.type.startsWith('tool-')) {
      const toolPart = part as Record<string, unknown>;
      return {
        ...toolPart,
        input: toolPart.input !== undefined ? redactValue(toolPart.input) : toolPart.input,
        output: toolPart.output !== undefined ? redactValue(toolPart.output) : toolPart.output,
      } as typeof part;
    }
    return part;
  });
}
