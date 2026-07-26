import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { PutObjectInput, StorageProvider, StoredObject } from '../types';

/**
 * Filesystem storage. Default for self-hosted installations with no S3.
 *
 * Objects live under `PEON_DATA_DIR/storage` and are served back through
 * `/api/storage/[...key]`, which enforces the same session checks as the rest of
 * the API. Nothing here is world-readable by virtue of being on disk.
 */

export function storageRoot(): string {
  const base = process.env.PEON_DATA_DIR?.trim() || '/data/peon';
  return path.join(base, 'storage');
}

/**
 * Resolve a key to an absolute path, refusing anything that escapes the root.
 *
 * Keys reach this from user-influenced places (avatar filenames, service uuids),
 * so `..` and absolute paths must not be able to write outside the store.
 */
export function resolveObjectPath(key: string): string {
  const root = storageRoot();
  const normalized = path.posix.normalize(key).replace(/^(\.\.(\/|$))+/, '');
  const full = path.join(root, normalized);
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to access a path outside the storage root: ${key}`);
  }
  return full;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;

  async put(input: PutObjectInput): Promise<StoredObject> {
    const full = resolveObjectPath(input.key);
    await mkdir(path.dirname(full), { recursive: true });

    if (input.body instanceof Readable) {
      // Streamed so a multi-GB object never lands in the heap.
      await pipeline(input.body, createWriteStream(full));
    } else {
      await pipeline(Readable.from([Buffer.from(input.body)]), createWriteStream(full));
    }

    return { key: input.key, url: this.publicUrl(input.key) };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(resolveObjectPath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(resolveObjectPath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(resolveObjectPath(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Local objects are served by the app, so there is nothing to sign. */
  async signedUrl(key: string): Promise<string> {
    return this.publicUrl(key);
  }

  /** Browser-direct upload is not possible; callers upload through the app. */
  async presignedUpload(): Promise<null> {
    return null;
  }

  private publicUrl(key: string): string {
    return `/api/storage/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}
