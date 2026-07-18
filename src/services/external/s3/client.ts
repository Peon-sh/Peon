import { S3Client } from '@aws-sdk/client-s3';
import { decrypt } from '@/lib/crypto/encryption';
import type { S3Storage } from '@/lib/prisma';
import { serverEnv } from '@/lib/env';
import { isE2eMode } from '@/lib/e2e';
import { awsCredentialsIfConfigured, awsRegion } from '@/lib/aws/credentials';

function e2eS3Client(): S3Client {
  return {
    send: async () => ({}),
  } as unknown as S3Client;
}

/** Per-workspace storage credentials (user-configured S3 destinations). */
export function s3ClientFor(storage: S3Storage): S3Client {
  if (isE2eMode()) return e2eS3Client();
  return new S3Client({
    region: storage.region,
    ...(storage.endpoint ? { endpoint: storage.endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: decrypt(storage.accessKey),
      secretAccessKey: decrypt(storage.secretKey),
    },
  });
}

/**
 * Platform S3 client using shared AWS credentials.
 * Used for app-level assets when `S3_BUCKET` is configured.
 */
export function platformS3Client(): S3Client {
  if (isE2eMode()) return e2eS3Client();
  const env = serverEnv();
  const staticCredentials =
    env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : awsCredentialsIfConfigured();
  return new S3Client({
    region: env.S3_REGION || awsRegion(),
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(staticCredentials ? { credentials: staticCredentials } : {}),
  });
}

export function platformS3Bucket(): string {
  const bucket = serverEnv().S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not configured.');
  return bucket;
}
