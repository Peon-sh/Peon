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
      `docker exec 'webapp-abc' sh -c 'curl -H "Authorization: Bearer $CRON_SECRET" https://example.com'`,
    );
  });

  it('adds -i for stdin-fed commands (restore path)', () => {
    expect(dockerExecShellCommand('db-abc', 'psql -U peon', { interactive: true })).toBe(
      `docker exec -i 'db-abc' sh -c 'psql -U peon'`,
    );
  });

  it('escapes a command that tries to close the sh -c argument', () => {
    const cmd = dockerExecShellCommand('db-abc', `mysqldump -px'; id > /tmp/pwned; echo '`);

    expect(cmd).toBe(
      `docker exec 'db-abc' sh -c 'mysqldump -px'\\''; id > /tmp/pwned; echo '\\'''`,
    );

    // Property: once the `'\''` escape sequences are accounted for, exactly four
    // bare quotes remain — container delimiters plus the sh -c argument pair.
    const bareQuotes = cmd.split(`'\\''`).join('|').match(/'/g) ?? [];
    expect(bareQuotes).toHaveLength(4);
  });
});
