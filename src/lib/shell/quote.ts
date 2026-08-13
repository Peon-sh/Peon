/**
 * Quote a string for a POSIX shell so the remote SSH shell does not interpolate
 * `$VARS` / backticks before `docker exec … sh -c` sees them.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build `docker exec <container> sh -c '<command>'` with safe quoting.
 * Pass `interactive` for commands that read a dump from stdin (`docker exec -i`).
 */
export function dockerExecShellCommand(
  container: string,
  command: string,
  opts?: { interactive?: boolean },
): string {
  const flags = opts?.interactive ? ' -i' : '';
  return `docker exec${flags} ${shellSingleQuote(container)} sh -c ${shellSingleQuote(command)}`;
}
