import { shellSingleQuote } from '@/lib/shell/quote';

/**
 * Interactive shell inside a container via `docker exec -it`.
 *
 * Forces a visible `$ ` prompt (bash without rc files, or ash with ENV cleared)
 * so the browser terminal never shows a bare blinking cursor.
 */
export function dockerExecInteractiveCommand(container: string): string {
  // Keep PS1 as a plain `$ ` — bash --norc/--noprofile won't overwrite it from
  // bashrc, and busybox ash still prints it when ENV is /dev/null.
  const inner =
    'export TERM=xterm-256color; ' +
    'export PS1="$ "; ' +
    'if command -v bash >/dev/null 2>&1; then ' +
    'exec bash --norc --noprofile -i; ' +
    'else ' +
    'export ENV=/dev/null; ' +
    'exec sh -i; ' +
    'fi';

  return (
    `docker exec -it` +
    ` -e TERM=xterm-256color` +
    ` -e PS1=${shellSingleQuote('$ ')}` +
    ` ${shellSingleQuote(container)}` +
    ` sh -c ${shellSingleQuote(inner)}`
  );
}
