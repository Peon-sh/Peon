import { describe, expect, it } from 'vitest';
import { chartRows, parseChatVisual } from '../visuals';
import { redactUiMessageParts } from '../redact-message';
import type { UIMessage } from 'ai';

describe('chat visuals', () => {
  it('accepts valid metric and chart visuals', () => {
    expect(
      parseChatVisual({
        kind: 'metric',
        title: 'Services',
        value: 3,
        status: 'ok',
      }),
    ).toMatchObject({ kind: 'metric', value: 3 });

    expect(
      parseChatVisual({
        kind: 'barChart',
        title: 'Durations',
        series: [{ label: 'a', value: 1.5 }],
      })?.kind,
    ).toBe('barChart');
  });

  it('accepts multi-series bar charts', () => {
    const visual = parseChatVisual({
      kind: 'barChart',
      title: 'Deployments this week',
      datasets: [
        {
          name: 'Successful',
          points: [
            { label: 'Mon', value: 4 },
            { label: 'Tue', value: 2 },
          ],
        },
        {
          name: 'Failed',
          points: [
            { label: 'Mon', value: 1 },
            { label: 'Tue', value: 3 },
          ],
        },
      ],
    });
    expect(visual?.kind).toBe('barChart');
    if (visual?.kind !== 'barChart') return;
    expect(chartRows(visual)).toEqual({
      keys: ['Successful', 'Failed'],
      data: [
        { label: 'Mon', Successful: 4, Failed: 1 },
        { label: 'Tue', Successful: 2, Failed: 3 },
      ],
    });
  });

  it('rejects invalid visuals', () => {
    expect(parseChatVisual({ kind: 'barChart', title: 'x', series: [] })).toBeNull();
    expect(parseChatVisual({ kind: 'barChart', title: 'x' })).toBeNull();
    expect(parseChatVisual({ kind: 'unknown', title: 'x' })).toBeNull();
  });
});

describe('redactUiMessageParts', () => {
  it('redacts reasoning and tool inputs', () => {
    const parts = [
      { type: 'reasoning', text: 'API_KEY=abc123verysecretvaluehere', state: 'done' },
      {
        type: 'tool-set_env',
        toolCallId: '1',
        state: 'output-available',
        input: { key: 'X', value: 'secret' },
        output: { ok: true },
      },
    ] as UIMessage['parts'];

    const redacted = redactUiMessageParts(parts);
    const reasoning = redacted[0] as { text: string };
    expect(reasoning.text).toContain('[REDACTED]');
    const tool = redacted[1] as { input: { value: string } };
    expect(tool.input.value).toBe('[REDACTED]');
  });
});
