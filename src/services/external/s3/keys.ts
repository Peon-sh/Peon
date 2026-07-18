import { serverEnv } from '@/lib/env';
import { awsRegion } from '@/lib/aws/credentials';

/**
 * Platform S3 key layout for app-owned assets (not workspace backup storages).
 *
 *   deployments/{serviceUuid}/{deploymentId}/preview.png
 *   users/{userId}/avatar.{ext}
 */
export const PlatformS3Keys = {
  deploymentPreview: (serviceUuid: string, deploymentId: string) =>
    `deployments/${serviceUuid}/${deploymentId}/preview.png`,
  userAvatar: (userId: string, ext: string) => {
    const safe = ext.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    return `users/${userId}/avatar.${safe}`;
  },
} as const;

/** AWS SigV4 max expiry with IAM user credentials (7 days). */
export const PRESIGN_MAX_EXPIRES_SECONDS = 60 * 60 * 24 * 7;

function platformRegion(): string {
  const env = serverEnv();
  return env.S3_REGION || awsRegion();
}

function platformBucket(): string {
  const bucket = serverEnv().S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not configured.');
  return bucket;
}

/**
 * Permanent HTTPS URL for a platform object (virtual-hosted–style, or path-style
 * when `S3_ENDPOINT` is set). Not signed — usable for lifetime public access when
 * the object is publicly readable via ACL or bucket policy.
 */
export function platformObjectPublicUrl(key: string): string {
  const bucket = platformBucket();
  const env = serverEnv();
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  if (env.S3_ENDPOINT) {
    const base = env.S3_ENDPOINT.replace(/\/$/, '');
    return `${base}/${bucket}/${encoded}`;
  }
  return `https://${bucket}.s3.${platformRegion()}.amazonaws.com/${encoded}`;
}
