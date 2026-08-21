import { PutObjectCommand } from '@aws-sdk/client-s3';
import { sshPool, type SshTarget } from '@/lib/ssh';
import { s3ClientForSafe } from './client';
import type { S3Storage } from '@/lib/prisma';

/**
 * Stream a file that lives on a remote server up to S3. The file is read over
 * SSH (base64 to preserve binary) and uploaded via PutObject.
 */
export async function uploadFileFromServer(
  target: SshTarget,
  remotePath: string,
  key: string,
  storage: S3Storage,
): Promise<void> {
  const res = await sshPool.exec(target, `base64 ${remotePath}`);
  if (res.code !== 0) throw new Error('Failed to read backup file for upload.');
  const body = Buffer.from(res.stdout.replace(/\s+/g, ''), 'base64');

  const client = await s3ClientForSafe(storage);
  await client.send(
    new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body }),
  );
}
