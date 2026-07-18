/**
 * Quote a string for a POSIX shell so the remote SSH shell does not interpolate
 * `$VARS` / backticks before `docker exec … sh -c` sees them.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Build `docker exec <container> sh -c '<command>'` with safe quoting. */
export function dockerExecShellCommand(container: string, command: string): string {
  return `docker exec ${container} sh -c ${shellSingleQuote(command)}`;
}
