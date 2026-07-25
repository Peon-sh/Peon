/**
 * Validation for git ref names that end up inside remote shell scripts.
 *
 * Ref names are attacker-controlled on the preview path (a PR head branch comes
 * straight from the GitHub webhook), and git itself allows `$ ( ) ` | ; &` in a
 * refname. Quoting alone is enough to stay safe, but we also reject anything
 * outside a conservative whitelist so a hostile branch is refused at the edge
 * instead of reaching the server.
 */

/** Conservative subset of `git check-ref-format` for names we hand to a shell. */
export const SAFE_GIT_REF = /^[A-Za-z0-9._\-/]+$/;

export const MAX_GIT_REF_LENGTH = 255;

/** True when the ref is safe to pass to git on a remote host. */
export function isSafeGitRefName(ref: string | null | undefined): boolean {
  if (typeof ref !== 'string') return false;
  if (!ref || ref.length > MAX_GIT_REF_LENGTH) return false;
  if (!SAFE_GIT_REF.test(ref)) return false;
  // A leading dash would be parsed as an option by `git fetch origin <ref>`.
  if (ref.startsWith('-')) return false;
  if (ref.startsWith('/') || ref.endsWith('/') || ref.includes('//')) return false;
  if (ref.includes('..')) return false;
  if (ref.startsWith('.') || ref.endsWith('.')) return false;
  if (ref.endsWith('.lock')) return false;
  return true;
}

/** Return the ref unchanged, or throw when it is not a safe refname. */
export function assertSafeGitRefName(ref: string, label = 'branch'): string {
  if (!isSafeGitRefName(ref)) {
    throw new Error(`Invalid ${label}: contains forbidden characters (${ref}).`);
  }
  return ref;
}
