import { describe, it, expect } from 'vitest';
import { parseRunOutput } from '../format-run-output';

describe('parseRunOutput', () => {
  it('treats blank output as empty', () => {
    expect(parseRunOutput(null)).toEqual({ empty: true, blocks: [] });
    expect(parseRunOutput('   ')).toEqual({ empty: true, blocks: [] });
  });

  it('pretty-prints pure JSON', () => {
    const parsed = parseRunOutput('{"success":true,"data":{"n":1}}');
    expect(parsed.empty).toBe(false);
    if (parsed.empty) return;
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]?.kind).toBe('json');
    expect(parsed.blocks[0]?.text).toContain('\n');
    expect(parsed.blocks[0]?.text).toContain('"success": true');
  });

  it('splits leading JSON from trailing text (e.g. curl progress)', () => {
    const raw =
      '{"success":true,"data":{"message":"ok"}}\n  % Total    % Received\n100   123';
    const parsed = parseRunOutput(raw);
    expect(parsed.empty).toBe(false);
    if (parsed.empty) return;
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]).toMatchObject({ kind: 'json', label: 'json' });
    expect(parsed.blocks[1]).toMatchObject({ kind: 'text', label: 'output' });
    expect(parsed.blocks[1]?.text).toContain('% Total');
  });

  it('keeps plain text as a single block', () => {
    const parsed = parseRunOutput('hello\nworld');
    expect(parsed).toEqual({
      empty: false,
      blocks: [{ kind: 'text', label: 'output', text: 'hello\nworld' }],
    });
  });
});
