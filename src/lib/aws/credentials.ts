import { serverEnv } from '@/lib/env';

/**
 * Shared AWS credentials used by SES, SQS, and S3.
 * Prefer service-specific overrides (S3_*, SQS_REGION) when set.
 */
export function awsCredentials() {
  const env = serverEnv();
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? 'local',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? 'local',
  };
}

/**
 * Return static AWS credentials only when both values are configured.
 * When undefined, AWS SDK falls back to the default provider chain
 * (for example ECS task role credentials in production).
 */
export function awsCredentialsIfConfigured():
  | { accessKeyId: string; secretAccessKey: string }
  | undefined {
  const env = serverEnv();
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return { accessKeyId, secretAccessKey };
}

export function awsRegion(fallback = 'us-east-1'): string {
  const env = serverEnv();
  return env.AWS_REGION || env.SQS_REGION || env.S3_REGION || fallback;
}
