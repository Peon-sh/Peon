import { describe, expect, it } from 'vitest';
import { dockerExecShellCommand, shellSingleQuote } from '../quote';

describe('shellSingleQuote', () => {
  it('wraps in single quotes', () => {
    expect(shellSingleQuote('hello')).toBe("'hello'");
  });

  it('escapes embedded single quotes', () => {
    expect(shellSingleQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('preserves $VAR literally for the outer shell', () => {
    const q = shellSingleQuote('echo $CRON_SECRET');
    expect(q).toContain('$CRON_SECRET');
    expect(q.startsWith("'")).toBe(true);
    expect(q.endsWith("'")).toBe(true);
  });
});

describe('dockerExecShellCommand', () => {
  it('prevents host expansion of $CRON_SECRET', () => {
    const cmd = dockerExecShellCommand(
      'webapp-abc',
      'curl -H "Authorization: Bearer $CRON_SECRET" https://example.com',
    );
    // Outer argument to sh -c is single-quoted, so remote bash won't expand $.
    expect(cmd).toBe(
      `docker exec webapp-abc sh -c 'curl -H "Authorization: Bearer $CRON_SECRET" https://example.com'`,
    );
  });
});
