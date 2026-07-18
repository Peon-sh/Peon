import path from 'node:path';
import { defineConfig } from 'vitest/config';

const databaseUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@localhost:5432/peon_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/integration/**/*.integration.test.ts'],
    setupFiles: ['./src/test/integration/setup.ts'],
    globalSetup: ['./src/test/integration/global-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 90_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      PEON_E2E: '1',
      PEON_TEST_BASE_URL: process.env.PEON_TEST_BASE_URL ?? 'http://127.0.0.1:3100',
      DATABASE_URL: databaseUrl,
      DATABASE_URL_TEST: databaseUrl,
      JWT_SECRET: 'test-jwt-secret-at-least-32-chars!!',
      JWT_KEY: 'peon-auth-token',
      ENCRYPTION_KEY: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
      APP_URL: 'http://127.0.0.1:3100',
      EMAIL_DRIVER: 'test',
      INSTANCE_OWNER_EMAIL: 'owner@peon.test',
      SQS_DEPLOYMENT_QUEUE_URL: 'http://localhost:9324/000000000000/peon-deployments',
      SQS_TASKS_QUEUE_URL: 'http://localhost:9324/000000000000/peon-tasks',
      S3_BUCKET: 'peon-test-bucket',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_SLUG: 'peon-test',
      GITHUB_APP_WEBHOOK_SECRET: 'whsec-test',
      GITHUB_APP_PRIVATE_KEY:
        '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKtest\n-----END RSA PRIVATE KEY-----',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
