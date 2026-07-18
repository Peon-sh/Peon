import { tool, type UIMessageStreamWriter } from 'ai';
import { chatVisualSchema, parseChatVisual, type ChatVisual } from './visuals';

/** Chat-only tool: validates a visual and streams it as a `data-visual` message part. */
export function createPresentVisualTool(writer: UIMessageStreamWriter) {
  return tool({
    description:
      'Render a structured visual in the chat UI (metric, status list, timeline, bar chart, or line chart). Prefer this over ASCII tables when the user asks for a chart or when comparing counts/trends.',
    inputSchema: chatVisualSchema,
    execute: async (input): Promise<{ ok: true; kind: ChatVisual['kind']; title: string }> => {
      const visual = parseChatVisual(input);
      if (!visual) {
        throw new Error('Invalid visual payload');
      }

      writer.write({
        type: 'data-visual',
        id: crypto.randomUUID(),
        data: visual,
      } as never);

      return { ok: true, kind: visual.kind, title: visual.title };
    },
  });
}
