const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /(?:password|passwd|secret|token|value|private.?key|raw|client.?secret|access.?key|api.?key|authorization|credential)/i;

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

export function redactObject(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactValue(value),
    ]),
  );
}

export function redactByKeys(object: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const sensitiveKeys = new Set(keys.map((key) => key.toLowerCase()));
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? REDACTED : redactValue(value),
    ]),
  );
}

export function redactText(text: string): string {
  return text
    .replace(
      /(^|[\s,;])([A-Z][A-Z0-9_]{1,})=("[^"]*"|'[^']*'|[^\s,;]+)/gm,
      (_match, prefix: string, key: string) => `${prefix}${key}=${REDACTED}`,
    )
    .replace(
      /\b(?:[A-Za-z0-9+/]{40,}={0,2}|[A-Za-z0-9_-]{40,})\b/g,
      REDACTED,
    );
}
