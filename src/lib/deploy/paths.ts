/**
 * Repo path helpers for base directory / Dockerfile location.
 * Paths are stored with a leading slash and resolved against the build workdir.
 */

const SAFE_PATH = /^\/[a-zA-Z0-9._\-/@+~]*$/;

/** Normalize a repo-relative path: leading slash, no trailing slash (except `/`). */
export function normalizeRepoPath(path: string | null | undefined, fallback = '/'): string {
  let p = (path ?? '').trim();
  if (!p) p = fallback;
  p = p.replace(/\/+$/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.includes('..')) {
    throw new Error(`Invalid path: path traversal is not allowed (${path}).`);
  }
  if (!SAFE_PATH.test(p === '/' ? '/' : p)) {
    // Allow bare `/` even though SAFE_PATH requires a char after `/` for files.
    if (p !== '/') {
      throw new Error(`Invalid path: contains forbidden characters (${path}).`);
    }
  }
  return p || '/';
}

/** Default Dockerfile location when unset. */
export function normalizeDockerfileLocation(path: string | null | undefined): string {
  return normalizeRepoPath(path, '/Dockerfile');
}

/**
 * Absolute Dockerfile path for `docker build -f`, relative to the build workdir.
 * Concatenate `workdir + dockerfile_location` (e.g. `/data/app` + `/docker/Dockerfile.worker`).
 */
export function resolveDockerfileBuildPath(
  workdir: string,
  dockerfilePath: string | null | undefined,
): string {
  const location = normalizeDockerfileLocation(dockerfilePath);
  const root = workdir.replace(/\/+$/, '');
  return `${root}${location}`;
}
