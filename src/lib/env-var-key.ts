import { AppError } from '@/lib/errors';

/**
 * Environment variable names.
 *
 * Keys end up in shell assignment prefixes (`KEY=value cmd`), `.env` files and
 * compose `environment:` blocks, none of which can quote the name — so the name
 * itself has to be a plain identifier. This is the single definition; every
 * boundary and the domain layer share it.
 */
export const ENV_VAR_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const MAX_ENV_VAR_KEY_LENGTH = 255;

export function isValidEnvVarKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= MAX_ENV_VAR_KEY_LENGTH &&
    ENV_VAR_KEY.test(key)
  );
}

/** Return the key unchanged, or throw a 400 when it is not a valid name. */
export function assertValidEnvVarKey(key: string): string {
  if (!isValidEnvVarKey(key)) {
    throw new AppError(`Invalid variable key: "${key}"`);
  }
  return key;
}
