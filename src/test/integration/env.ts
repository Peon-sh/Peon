/**
 * Must load before any app module that reads process.env at import time.
 * Vitest integration config loads this via setupFiles.
 */
Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV || 'test',
  APP_URL: process.env.APP_URL ?? 'http://127.0.0.1:3100',
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/peon_test?schema=public',
  JWT_SECRET: process.env.JWT_SECRET ?? 'test-jwt-secret-at-least-32-chars!!',
  JWT_KEY: process.env.JWT_KEY ?? 'peon-auth-token',
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY ??
    Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
  EMAIL_DRIVER: process.env.EMAIL_DRIVER ?? 'test',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'no-reply@peon.test',
  INSTANCE_OWNER_EMAIL: process.env.INSTANCE_OWNER_EMAIL ?? 'owner@peon.test',
  SQS_DEPLOYMENT_QUEUE_URL:
    process.env.SQS_DEPLOYMENT_QUEUE_URL ?? 'http://localhost:9324/000000000000/peon-deployments',
  SQS_TASKS_QUEUE_URL:
    process.env.SQS_TASKS_QUEUE_URL ?? 'http://localhost:9324/000000000000/peon-tasks',
  S3_BUCKET: process.env.S3_BUCKET ?? 'peon-test-bucket',
  GITHUB_APP_ID: process.env.GITHUB_APP_ID ?? '12345',
  GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG ?? 'peon-test',
  GITHUB_APP_WEBHOOK_SECRET: process.env.GITHUB_APP_WEBHOOK_SECRET ?? 'whsec-test',
  GITHUB_APP_PRIVATE_KEY:
    process.env.GITHUB_APP_PRIVATE_KEY ??
    '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKtest\n-----END RSA PRIVATE KEY-----',
  PEON_E2E: process.env.PEON_E2E ?? '1',
});
