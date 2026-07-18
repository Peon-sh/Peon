/** Normalize GitHub numeric resource IDs (comments, check runs) for Prisma BigInt. */
export function asGithubId(
  value: number | bigint | string | null | undefined,
): bigint | null {
  if (value == null || value === '') return null;
  try {
    return typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    return null;
  }
}

export function githubIdsEqual(
  a: number | bigint | string | null | undefined,
  b: number | bigint | string | null | undefined,
): boolean {
  const left = asGithubId(a);
  const right = asGithubId(b);
  return left != null && right != null && left === right;
}

/** Safe path segment for GitHub REST URLs. */
export function githubIdPath(id: number | bigint): string {
  return String(id);
}
