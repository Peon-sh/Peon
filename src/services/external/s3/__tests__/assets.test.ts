import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: vi.fn(),
}));

vi.mock('@/lib/aws/credentials', () => ({
  awsRegion: () => 'us-east-1',
  awsCredentials: () => ({ accessKeyId: 'test', secretAccessKey: 'test' }),
}));

import { serverEnv } from '@/lib/env';
import {
  PlatformS3Keys,
  PRESIGN_MAX_EXPIRES_SECONDS,
  platformObjectPublicUrl,
} from '../keys';

describe('PlatformS3Keys', () => {
  it('builds deployment preview keys under deployments/{service}/{deployment}/', () => {
    expect(PlatformS3Keys.deploymentPreview('svc-uuid', 'dep-id')).toBe(
      'deployments/svc-uuid/dep-id/preview.png',
    );
  });
});

describe('platformObjectPublicUrl', () => {
  beforeEach(() => {
    vi.mocked(serverEnv).mockReturnValue({
      S3_BUCKET: 'peon-assets-prod',
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: undefined,
    } as ReturnType<typeof serverEnv>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a virtual-hosted lifetime public URL', () => {
    expect(platformObjectPublicUrl('deployments/svc/dep/preview.png')).toBe(
      'https://peon-assets-prod.s3.us-east-1.amazonaws.com/deployments/svc/dep/preview.png',
    );
  });

  it('encodes path segments', () => {
    expect(platformObjectPublicUrl('deployments/a b/c/preview.png')).toBe(
      'https://peon-assets-prod.s3.us-east-1.amazonaws.com/deployments/a%20b/c/preview.png',
    );
  });

  it('uses path-style URLs when S3_ENDPOINT is set', () => {
    vi.mocked(serverEnv).mockReturnValue({
      S3_BUCKET: 'local-bucket',
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: 'http://localhost:9000',
    } as ReturnType<typeof serverEnv>);

    expect(platformObjectPublicUrl('deployments/svc/dep/preview.png')).toBe(
      'http://localhost:9000/local-bucket/deployments/svc/dep/preview.png',
    );
  });
});

describe('PRESIGN_MAX_EXPIRES_SECONDS', () => {
  it('is the AWS SigV4 IAM maximum (7 days)', () => {
    expect(PRESIGN_MAX_EXPIRES_SECONDS).toBe(60 * 60 * 24 * 7);
  });
});
