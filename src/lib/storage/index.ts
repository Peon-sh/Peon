import { serverEnv } from '@/lib/env';
import type { StorageProvider } from './types';

export type { StorageProvider, PutObjectInput, StoredObject } from './types';

let provider: StorageProvider | null = null;
let loading: Promise<StorageProvider> | null = null;

/**
 * Pick a storage backend.
 *
 * Backwards compatible: an installation with `S3_BUCKET` set and no explicit
 * `STORAGE_DRIVER` keeps using S3, so existing avatar and screenshot URLs stay
 * valid. New installations default to local disk and need no AWS account.
 */
export function resolveStorageDriver(): 'local' | 's3' {
  const env = serverEnv();
  if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3') return env.STORAGE_DRIVER;
  return env.S3_BUCKET?.trim() ? 's3' : 'local';
}

export function getStorageProvider(): Promise<StorageProvider> {
  if (provider) return Promise.resolve(provider);
  if (loading) return loading;

  loading = (async () => {
    if (resolveStorageDriver() === 's3') {
      const { S3StorageProvider } = await import('./providers/s3');
      provider = new S3StorageProvider();
    } else {
      const { LocalStorageProvider } = await import('./providers/local');
      provider = new LocalStorageProvider();
    }
    return provider;
  })();

  return loading;
}

/** Replace or clear the provider (tests). */
export function setStorageProvider(next: StorageProvider | null): void {
  provider = next;
  loading = null;
}

/**
 * True when platform object storage is usable at all.
 *
 * Always true now — local disk is always available — but kept so callers that
 * previously branched on `isPlatformS3Configured()` keep a meaningful check.
 */
export function isStorageConfigured(): boolean {
  return true;
}
