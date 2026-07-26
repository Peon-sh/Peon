import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return { ...actual, serverEnv: vi.fn() };
});

import { serverEnv } from '@/lib/env';
import { resolveQueueDriver, setQueueProvider } from '../index';

const env = vi.mocked(serverEnv);

function withEnv(values: Record<string, string | undefined>): void {
  env.mockReturnValue(values as never);
}

const SQS_URLS = {
  SQS_DEPLOYMENT_QUEUE_URL: 'https://sqs.example/deployments',
  SQS_TASKS_QUEUE_URL: 'https://sqs.example/tasks',
};

describe('queue driver resolution', () => {
  beforeEach(() => {
    setQueueProvider(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    setQueueProvider(null);
  });

  describe('backwards compatibility — existing AWS installations', () => {
    it('picks sqs when SQS URLs are configured and QUEUE_DRIVER is unset', () => {
      // The critical case: an existing install must NEVER be silently moved to
      // the Postgres queue, which would strand in-flight jobs in SQS.
      withEnv({ ...SQS_URLS, QUEUE_DRIVER: undefined });
      expect(resolveQueueDriver()).toBe('sqs');
    });

    it('honours an explicit QUEUE_DRIVER=sqs', () => {
      withEnv({ ...SQS_URLS, QUEUE_DRIVER: 'sqs' });
      expect(resolveQueueDriver()).toBe('sqs');
    });
  });

  describe('new installations', () => {
    it('defaults to postgres when no SQS URLs are configured', () => {
      withEnv({ QUEUE_DRIVER: undefined });
      expect(resolveQueueDriver()).toBe('postgres');
    });

    it('defaults to postgres when only one SQS URL is set', () => {
      withEnv({ SQS_DEPLOYMENT_QUEUE_URL: 'https://sqs.example/deployments' });
      expect(resolveQueueDriver()).toBe('postgres');
    });
  });

  describe('explicit override', () => {
    it('allows opting into postgres even with SQS configured', () => {
      // Deliberate migration away from AWS.
      withEnv({ ...SQS_URLS, QUEUE_DRIVER: 'postgres' });
      expect(resolveQueueDriver()).toBe('postgres');
    });

    it('allows opting into sqs before URLs are read', () => {
      withEnv({ QUEUE_DRIVER: 'sqs' });
      expect(resolveQueueDriver()).toBe('sqs');
    });
  });
});
