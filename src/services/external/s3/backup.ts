import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { sshPool, type SshTarget } from '@/lib/ssh';
import { s3ClientFor } from './client';
import type { S3Storage } from '@/lib/prisma';

/**
 * Stream a backup file from a managed server up to S3.
 *
 * The previous implementation ran `base64 <file>` over SSH and decoded the whole
 * result in memory:
 *
 *     const res = await sshPool.exec(target, `base64 ${remotePath}`);
 *     const body = Buffer.from(res.stdout.replace(/\s+/g, ''), 'base64');
 *
 * That holds roughly 2.4x the dump size in heap at once — the base64 string plus
 * the decoded Buffer — so a 2 GB database needed ~5 GB and killed the worker.
 *
 * Now the file is pulled over SFTP to a temp path (streamed to disk by
 * `sshPool.getFile`), then streamed into S3 as a multipart upload. Peak memory is
 * one part, not the whole backup. Disk still needs room for the dump.
 */
export async function uploadFileFromServer(
  target: SshTarget,
  remotePath: string,
  key: string,
  storage: S3Storage,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'peon-backup-upload-'));
  const localPath = join(dir, 'dump');

  try {
    await sshPool.getFile(target, remotePath, localPath);

    const { size } = await stat(localPath);
    const client = s3ClientFor(storage);

    // Multipart handles arbitrarily large files and retries individual parts.
    const upload = new Upload({
      client,
      params: {
        Bucket: storage.bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size,
      },
      // 8 MiB parts: above S3's 5 MiB minimum, small enough that a couple of
      // concurrent parts stay comfortable on a small worker.
      partSize: 8 * 1024 * 1024,
      queueSize: 2,
    });

    await upload.done();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Upload an in-memory buffer. For small payloads only — anything that could be
 * large should go through {@link uploadFileFromServer}.
 */
export async function uploadBufferToStorage(
  body: Buffer,
  key: string,
  storage: S3Storage,
): Promise<void> {
  await s3ClientFor(storage).send(
    new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body }),
  );
}
