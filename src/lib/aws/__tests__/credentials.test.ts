import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: vi.fn(),
}));

import { serverEnv } from '@/lib/env';
import { awsCredentialsIfConfigured } from '../credentials';

describe('awsCredentialsIfConfigured', () => {
  it('returns undefined when shared access key is missing', () => {
    vi.mocked(serverEnv).mockReturnValue({
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: 'secret',
    } as ReturnType<typeof serverEnv>);

    expect(awsCredentialsIfConfigured()).toBeUndefined();
  });

  it('returns undefined when shared secret key is missing', () => {
    vi.mocked(serverEnv).mockReturnValue({
      AWS_ACCESS_KEY_ID: 'AKIA123',
      AWS_SECRET_ACCESS_KEY: undefined,
    } as ReturnType<typeof serverEnv>);

    expect(awsCredentialsIfConfigured()).toBeUndefined();
  });

  it('returns both credentials when they are configured', () => {
    vi.mocked(serverEnv).mockReturnValue({
      AWS_ACCESS_KEY_ID: 'AKIA123',
      AWS_SECRET_ACCESS_KEY: 'secret',
    } as ReturnType<typeof serverEnv>);

    expect(awsCredentialsIfConfigured()).toEqual({
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret',
    });
  });
});
