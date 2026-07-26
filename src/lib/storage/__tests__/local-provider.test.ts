import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorageProvider, resolveObjectPath, storageRoot } from '../providers/local';

let dataDir: string;
const provider = new LocalStorageProvider();

describe('LocalStorageProvider', () => {
  const original = process.env.PEON_DATA_DIR;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'peon-storage-test-'));
    process.env.PEON_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    process.env.PEON_DATA_DIR = original;
    await rm(dataDir, { recursive: true, force: true });
  });

  describe('path safety', () => {
    it('keeps objects under the storage root', () => {
      expect(resolveObjectPath('users/u1/avatar.png')).toBe(
        join(storageRoot(), 'users/u1/avatar.png'),
      );
    });

    it('refuses traversal out of the root', () => {
      // Keys are influenced by user data (uuids, filenames), so escaping the
      // root would be an arbitrary-file-write.
      expect(() => resolveObjectPath('../../etc/passwd')).toThrow(/outside the storage root/);
    });

    it('strips leading traversal segments', () => {
      const resolved = resolveObjectPath('../safe.png');
      expect(resolved.startsWith(storageRoot())).toBe(true);
    });

    it('refuses an absolute path escaping the root', () => {
      const resolved = resolveObjectPath('/etc/passwd');
      expect(resolved.startsWith(storageRoot())).toBe(true);
    });
  });

  describe('round trip', () => {
    it('stores and reads a buffer', async () => {
      await provider.put({
        key: 'a/b.png',
        body: Buffer.from('hello'),
        contentType: 'image/png',
      });
      expect((await provider.get('a/b.png'))?.toString()).toBe('hello');
    });

    it('creates nested directories', async () => {
      await provider.put({
        key: 'deep/nested/path/file.png',
        body: Buffer.from('x'),
        contentType: 'image/png',
      });
      const onDisk = await readFile(join(storageRoot(), 'deep/nested/path/file.png'));
      expect(onDisk.toString()).toBe('x');
    });

    it('streams a readable body without buffering it', async () => {
      await provider.put({
        key: 'stream.bin',
        body: Readable.from([Buffer.from('chunk1'), Buffer.from('chunk2')]),
        contentType: 'application/octet-stream',
      });
      expect((await provider.get('stream.bin'))?.toString()).toBe('chunk1chunk2');
    });

    it('returns null for a missing object', async () => {
      expect(await provider.get('nope.png')).toBeNull();
    });

    it('reports existence', async () => {
      expect(await provider.exists('x.png')).toBe(false);
      await provider.put({ key: 'x.png', body: Buffer.from('1'), contentType: 'image/png' });
      expect(await provider.exists('x.png')).toBe(true);
    });

    it('deletes, and deleting twice is not an error', async () => {
      await provider.put({ key: 'gone.png', body: Buffer.from('1'), contentType: 'image/png' });
      await provider.delete('gone.png');
      expect(await provider.exists('gone.png')).toBe(false);
      await expect(provider.delete('gone.png')).resolves.toBeUndefined();
    });
  });

  describe('urls', () => {
    it('returns an app route rather than a filesystem path', async () => {
      const stored = await provider.put({
        key: 'users/u1/avatar.png',
        body: Buffer.from('1'),
        contentType: 'image/png',
      });
      expect(stored.url).toBe('/api/storage/users/u1/avatar.png');
    });

    it('signedUrl is the same app route — access is gated by session, not signature', async () => {
      expect(await provider.signedUrl('users/u1/avatar.png')).toBe(
        '/api/storage/users/u1/avatar.png',
      );
    });

    it('offers no presigned upload, so callers fall back to app upload', async () => {
      expect(await provider.presignedUpload()).toBeNull();
    });
  });
});
