import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { serverEnv } from '@/lib/env';
import { isE2eMode } from '@/lib/e2e';
import { platformS3Bucket, platformS3Client } from './client';
import {
  PRESIGN_MAX_EXPIRES_SECONDS,
  platformObjectPublicUrl,
} from './keys';

export {
  PRESIGN_MAX_EXPIRES_SECONDS,
  PlatformS3Keys,
  platformObjectPublicUrl,
} from './keys';

export type UploadPlatformObjectInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /**
   * When true, set `public-read` ACL so the permanent object URL works without
   * signing. Requires the bucket to allow ACLs (not "Bucket owner enforced").
   * Prefer a bucket policy on `deployments/*` when ACLs are disabled.
   */
  publicRead?: boolean;
  cacheControl?: string;
};

export type UploadedPlatformObject = {
  key: string;
  bucket: string;
  /** Permanent (unsigned) HTTPS object URL — lifetime public when the object/prefix is public. */
  publicUrl: string;
  /**
   * Long-lived signed GET URL (max 7 days). Prefer `publicUrl` for lifetime access
   * when the bucket/prefix is publicly readable.
   */
  presignedUrl: string;
};

/** Presigned GET URL for a platform object. Caps at {@link PRESIGN_MAX_EXPIRES_SECONDS}. */
export async function presignPlatformObject(
  key: string,
  expiresInSeconds: number = PRESIGN_MAX_EXPIRES_SECONDS,
): Promise<string> {
  if (isE2eMode()) return `https://s3.example.test/get/${encodeURIComponent(key)}`;
  const client = platformS3Client();
  const bucket = platformS3Bucket();
  const expiresIn = Math.min(Math.max(1, expiresInSeconds), PRESIGN_MAX_EXPIRES_SECONDS);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}

const PRESIGN_PUT_MAX_SECONDS = 10 * 60;

/**
 * Presigned PUT URL for direct browser uploads to the platform bucket.
 * Only signs headers the browser will send (Content-Type) — extra signed
 * headers like CacheControl cause SignatureDoesNotMatch on client PUT.
 */
export async function presignPlatformPutObject(
  key: string,
  contentType: string,
  expiresInSeconds: number = PRESIGN_PUT_MAX_SECONDS,
): Promise<string> {
  if (isE2eMode()) return `https://s3.example.test/put/${encodeURIComponent(key)}`;
  const client = platformS3Client();
  const bucket = platformS3Bucket();
  const expiresIn = Math.min(Math.max(1, expiresInSeconds), PRESIGN_PUT_MAX_SECONDS);
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

export async function deletePlatformObject(key: string): Promise<void> {
  if (isE2eMode()) return;
  const client = platformS3Client();
  const bucket = platformS3Bucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Upload bytes to the platform bucket and return public + long-lived presigned URLs. */
export async function uploadPlatformObject(
  input: UploadPlatformObjectInput,
): Promise<UploadedPlatformObject> {
  if (isE2eMode()) {
    const bucket = process.env.S3_BUCKET || 'peon-test-bucket';
    return {
      key: input.key,
      bucket,
      publicUrl: `https://s3.example.test/${input.key}`,
      presignedUrl: `https://s3.example.test/get/${encodeURIComponent(input.key)}`,
    };
  }
  const client = platformS3Client();
  const bucket = platformS3Bucket();

  const put = async (acl?: ObjectCannedACL) =>
    client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
        ...(acl ? { ACL: acl } : {}),
      }),
    );

  if (input.publicRead) {
    try {
      await put('public-read');
    } catch {
      // Bucket owner–enforced ownership rejects ACLs; object URL still works with a public policy.
      await put();
    }
  } else {
    await put();
  }

  const publicUrl = platformObjectPublicUrl(input.key);
  const presignedUrl = await presignPlatformObject(input.key);

  return { key: input.key, bucket, publicUrl, presignedUrl };
}

/** Download a platform object as a Buffer. */
export async function getPlatformObject(key: string): Promise<Buffer> {
  if (isE2eMode()) return Buffer.from('e2e');
  const client = platformS3Client();
  const bucket = platformS3Bucket();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty S3 object: s3://${bucket}/${key}`);
  return Buffer.from(bytes);
}

export function isPlatformS3Configured(): boolean {
  return Boolean(serverEnv().S3_BUCKET);
}
