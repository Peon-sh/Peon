import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { platformS3Bucket, platformS3Client } from '@/services/external/s3/client';
import { platformObjectPublicUrl, PRESIGN_MAX_EXPIRES_SECONDS } from '@/services/external/s3/keys';
import type { PutObjectInput, StorageProvider, StoredObject } from '../types';

/**
 * S3 (and S3-compatible: MinIO, R2, Spaces) platform storage.
 *
 * Wraps the pre-existing platform-S3 helpers so behaviour and object URLs are
 * unchanged for installations already using them.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3' as const;

  async put(input: PutObjectInput): Promise<StoredObject> {
    const bucket = platformS3Bucket();
    await platformS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body as never,
        ContentType: input.contentType,
        ...(input.contentLength ? { ContentLength: input.contentLength } : {}),
        ...(input.cacheControl ? { CacheControl: input.cacheControl } : {}),
        ...(input.publicRead ? { ACL: 'public-read' as ObjectCannedACL } : {}),
      }),
    );
    return { key: input.key, url: platformObjectPublicUrl(bucket, input.key) };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await platformS3Client().send(
        new GetObjectCommand({ Bucket: platformS3Bucket(), Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await platformS3Client().send(
      new DeleteObjectCommand({ Bucket: platformS3Bucket(), Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await platformS3Client().send(
        new HeadObjectCommand({ Bucket: platformS3Bucket(), Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(key: string, expiresInSeconds = PRESIGN_MAX_EXPIRES_SECONDS): Promise<string> {
    return getSignedUrl(
      platformS3Client(),
      new GetObjectCommand({ Bucket: platformS3Bucket(), Key: key }),
      { expiresIn: Math.min(expiresInSeconds, PRESIGN_MAX_EXPIRES_SECONDS) },
    );
  }

  async presignedUpload(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<{ url: string }> {
    const url = await getSignedUrl(
      platformS3Client(),
      new PutObjectCommand({ Bucket: platformS3Bucket(), Key: key, ContentType: contentType }),
      { expiresIn: Math.min(expiresInSeconds, PRESIGN_MAX_EXPIRES_SECONDS) },
    );
    return { url };
  }
}
