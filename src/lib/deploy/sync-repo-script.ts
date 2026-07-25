import { shellSingleQuote } from '@/lib/shell/quote';

/**
 * Build the remote shell script that clones or updates a service git checkout.
 *
 * Every interpolated value is single-quoted: `src`, `repo`, `branch`, and
 * `commitSha` would otherwise be expanded by the remote shell — a double-quoted
 * assignment still evaluates `$(…)`, backticks and `${…}`.
 */
export function buildGitSyncScript(opts: {
  src: string;
  repo: string;
  branch: string;
  gitSshPrefix?: string;
  keyCleanup?: string;
  forceClean?: boolean;
  /** When set (e.g. rollback), fetch and check out this commit instead of the branch tip. */
  commitSha?: string | null;
}): string {
  const src = shellSingleQuote(opts.src);
  const repo = shellSingleQuote(opts.repo);
  const branch = shellSingleQuote(opts.branch);
  const commitSha = shellSingleQuote((opts.commitSha ?? '').trim());
  const gitSshPrefix = opts.gitSshPrefix ?? '';
  const keyCleanup = opts.keyCleanup ?? 'true';
  const forceClean = opts.forceClean ? '1' : '0';

  return `
set -e
SRC=${src}
REPO_URL=${repo}
BRANCH=${branch}
COMMIT_SHA=${commitSha}
FORCE_CLEAN=${forceClean}

if [ "$FORCE_CLEAN" = "1" ] && [ -d "$SRC" ]; then
  echo "Force rebuild: clearing cached source…"
  rm -rf "$SRC"
fi

if [ -n "$COMMIT_SHA" ]; then
  echo "Checking out commit $COMMIT_SHA…"
  if [ -d "$SRC/.git" ]; then
    cd "$SRC"
    ${gitSshPrefix}git remote set-url origin "$REPO_URL"
  else
    rm -rf "$SRC"
    mkdir -p "$SRC"
    cd "$SRC"
    git init
    git remote add origin "$REPO_URL"
  fi
  # Shallow-fetch the exact commit (GitHub/GitLab support fetch-by-sha).
  ${gitSshPrefix}git fetch --depth 1 origin "$COMMIT_SHA"
  git checkout -f FETCH_HEAD
  git reset --hard FETCH_HEAD
  git clean -fd
elif [ -d "$SRC/.git" ]; then
  cd "$SRC"
  ${gitSshPrefix}git remote set-url origin "$REPO_URL"
  # Fetch the branch tip explicitly — shallow clones can leave a stale origin/<branch>.
  ${gitSshPrefix}git fetch --depth 1 origin "$BRANCH"
  git checkout -B "$BRANCH" FETCH_HEAD
  git reset --hard FETCH_HEAD
  git clean -fd
else
  rm -rf "$SRC"
  ${gitSshPrefix}git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$SRC"
fi
${keyCleanup}
cd "$SRC" && git rev-parse HEAD
`.trim();
}
