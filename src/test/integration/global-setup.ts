import { spawn, type ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = Number(process.env.PEON_TEST_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function testEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production',
    PEON_E2E: '1',
    PORT: String(PORT),
    APP_URL: BASE_URL,
    NEXT_PUBLIC_APP_URL: BASE_URL,
    DATABASE_URL:
      process.env.DATABASE_URL_TEST ??
      'postgresql://postgres:postgres@localhost:5432/peon_test?schema=public',
    JWT_SECRET: process.env.JWT_SECRET ?? 'test-jwt-secret-at-least-32-chars!!',
    JWT_KEY: process.env.JWT_KEY ?? 'peon-auth-token',
    ENCRYPTION_KEY:
      process.env.ENCRYPTION_KEY ??
      Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    EMAIL_DRIVER: 'test',
    EMAIL_FROM: 'no-reply@peon.test',
    INSTANCE_OWNER_EMAIL: 'owner@peon.test',
    SQS_DEPLOYMENT_QUEUE_URL: 'http://localhost:9324/000000000000/peon-deployments',
    SQS_TASKS_QUEUE_URL: 'http://localhost:9324/000000000000/peon-tasks',
    SQS_ENDPOINT: 'http://localhost:9324',
    S3_BUCKET: 'peon-test-bucket',
    GITHUB_APP_ID: '12345',
    GITHUB_APP_SLUG: 'peon-test',
    GITHUB_APP_WEBHOOK_SECRET: 'whsec-test',
    GITHUB_APP_PRIVATE_KEY:
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKtest\n-----END RSA PRIVATE KEY-----',
    PEON_TEST_BASE_URL: BASE_URL,
  };
}

async function waitForHealth(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next.js test server did not become healthy at ${BASE_URL}/api/health`);
}

let server: ChildProcess | null = null;

export default async function globalSetup() {
  const env = testEnv();
  process.env.PEON_TEST_BASE_URL = BASE_URL;
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.DATABASE_URL_TEST = env.DATABASE_URL;
  process.env.PEON_E2E = '1';

  execSync('pnpm exec prisma migrate deploy', {
    cwd: root,
    stdio: 'inherit',
    env,
  });

  const nextDir = path.join(root, '.next');
  const skipBuild = process.env.PEON_TEST_SKIP_BUILD === '1';
  if (!skipBuild) {
    console.log('[e2e] Building Next.js app for API tests…');
    execSync('pnpm build', { cwd: root, stdio: 'inherit', env });
  } else if (!fs.existsSync(nextDir)) {
    throw new Error('PEON_TEST_SKIP_BUILD=1 but .next is missing. Run pnpm build first.');
  }

  console.log(`[e2e] Starting Next.js on ${BASE_URL}…`);
  server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  server.stdout?.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  server.stderr?.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));

  const pid = server.pid;
  await waitForHealth();
  console.log(`[e2e] Next.js ready (pid ${pid})`);

  return async () => {
    if (pid) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          server?.kill('SIGTERM');
        } catch {
          // ignore
        }
      }
    }
    server = null;
  };
}
