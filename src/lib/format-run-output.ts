export type RunOutputBlock =
  | { kind: 'json'; label: string; text: string }
  | { kind: 'text'; label: string; text: string };

export type ParsedRunOutput =
  | { empty: true; blocks: [] }
  | { empty: false; blocks: RunOutputBlock[] };

/**
 * Split task/cron stdout into display blocks. Prefers pretty JSON when the
 * payload (or a leading JSON value) can be parsed; leftover text stays as-is.
 */
export function parseRunOutput(raw: string | null | undefined): ParsedRunOutput {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { empty: true, blocks: [] };

  const asJson = tryPrettyJson(trimmed);
  if (asJson) {
    return { empty: false, blocks: [{ kind: 'json', label: 'json', text: asJson }] };
  }

  const leading = extractLeadingJson(trimmed);
  if (leading) {
    const blocks: RunOutputBlock[] = [
      { kind: 'json', label: 'json', text: leading.pretty },
    ];
    if (leading.rest) {
      blocks.push({ kind: 'text', label: 'output', text: leading.rest });
    }
    return { empty: false, blocks };
  }

  return { empty: false, blocks: [{ kind: 'text', label: 'output', text: trimmed }] };
}

function tryPrettyJson(value: string): string | null {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return null;
  }
}

/** Find a JSON object/array that starts at index 0 (brace-balanced). */
function extractLeadingJson(value: string): { pretty: string; rest: string } | null {
  const start = value[0];
  if (start !== '{' && start !== '[') return null;
  const close = start === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === start) depth++;
    else if (ch === close) depth--;
    if (depth === 0) {
      const candidate = value.slice(0, i + 1);
      const pretty = tryPrettyJson(candidate);
      if (!pretty) return null;
      return { pretty, rest: value.slice(i + 1).trim() };
    }
  }
  return null;
}
