/**
 * Quote a string for a POSIX shell so the remote SSH shell does not interpolate
 * `$VARS` / backticks before `docker exec … sh -c` sees them.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build `docker exec <container> sh -c '<command>'` with safe quoting. The
 * container is quoted too — scheduled tasks and raw compose files supply it.
 */
export function dockerExecShellCommand(container: string, command: string): string {
  return `docker exec ${shellSingleQuote(container)} sh -c ${shellSingleQuote(command)}`;
}
