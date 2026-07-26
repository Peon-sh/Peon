import { isValidEnvVarKey } from '@/lib/env-var-key';

/** Default Node major version for Nixpacks/Railpack builds (Nixpacks still defaults to EOL 18). */
export const DEFAULT_NODE_BUILD_VERSION = '22';

export const NIXPACKS_NODE_VERSION_KEY = 'NIXPACKS_NODE_VERSION';

/** Build packs that should get a default NIXPACKS_NODE_VERSION env var. */
export function buildPackNeedsNodeVersion(
  buildPack: string | null | undefined,
): buildPack is 'NIXPACKS' | 'RAILPACK' {
  return buildPack === 'NIXPACKS' || buildPack === 'RAILPACK';
}

type NixpacksCommandFields = {
  installCommand?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Resolve env for the image build.
 *
 * Includes every build-time service variable — not only NIXPACKS_* — so
 * frameworks like Next.js can inline `NEXT_PUBLIC_*` at `next build`.
 * Always ensures NIXPACKS_NODE_VERSION / RAILPACK_NODE_VERSION are set.
 *
 * Keys that are not valid variable names are dropped. {@link buildPackEnvPrefix}
 * emits shell assignment prefixes (`KEY=value cmd`), and a shell does not treat
 * a quoted word as an assignment — so the name cannot be escaped the way the
 * value can, and anything that is not a plain identifier must not reach it.
 * Names are validated when they are stored; this is the backstop.
 */
export function resolveBuildPackEnv(
  svc: NixpacksCommandFields,
  env: Record<string, string> = {},
): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!value.trim()) continue;
    if (!isValidEnvVarKey(key)) continue;
    entries[key] = value;
  }

  if (!entries.NIXPACKS_NODE_VERSION) {
    entries.NIXPACKS_NODE_VERSION = DEFAULT_NODE_BUILD_VERSION;
  }
  if (!entries.RAILPACK_NODE_VERSION) {
    entries.RAILPACK_NODE_VERSION =
      entries.NIXPACKS_NODE_VERSION ?? DEFAULT_NODE_BUILD_VERSION;
  }

  const commandOverrides: Array<[string, string | null | undefined]> = [
    ['NIXPACKS_INSTALL_CMD', svc.installCommand],
    ['NIXPACKS_BUILD_CMD', svc.buildCommand],
    ['NIXPACKS_START_CMD', svc.startCommand],
  ];
  for (const [key, value] of commandOverrides) {
    if (typeof value === 'string' && value.trim()) {
      entries[key] = value;
    }
  }

  return entries;
}

/**
 * Shell env prefix for `nixpacks build` / Railpack / `docker build`.
 * Prefer {@link buildPackCliEnvArgs} for Nixpacks — it often ignores process
 * env for Node version unless `--env` is passed.
 */
export function buildPackEnvPrefix(
  svc: NixpacksCommandFields,
  env: Record<string, string> = {},
): string {
  return Object.entries(resolveBuildPackEnv(svc, env))
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(' ');
}

/**
 * `--env KEY=VALUE` flags for `nixpacks build` / Railpack.
 * Passes all build-time vars (incl. NEXT_PUBLIC_*) into the build plan.
 */
export function buildPackCliEnvArgs(
  svc: NixpacksCommandFields,
  env: Record<string, string> = {},
): string {
  return Object.entries(resolveBuildPackEnv(svc, env))
    .map(([key, value]) => `--env ${shellQuote(`${key}=${value}`)}`)
    .join(' ');
}

/**
 * `docker build --build-arg KEY=VALUE` flags for Dockerfile builds so
 * NEXT_PUBLIC_* (and other build-time vars) can be declared as ARG/ENV.
 */
export function buildPackDockerBuildArgs(
  svc: NixpacksCommandFields,
  env: Record<string, string> = {},
): string {
  return Object.entries(resolveBuildPackEnv(svc, env))
    .filter(([key]) => !key.startsWith('NIXPACKS_') && !key.startsWith('RAILPACK_'))
    .map(([key, value]) => `--build-arg ${shellQuote(`${key}=${value}`)}`)
    .join(' ');
}

/** Major Node version that will be used for this Nixpacks/Railpack build. */
export function resolveNodeBuildVersion(env: Record<string, string> = {}): string {
  const fromEnv = env.NIXPACKS_NODE_VERSION?.trim() || env.RAILPACK_NODE_VERSION?.trim();
  return fromEnv || DEFAULT_NODE_BUILD_VERSION;
}
