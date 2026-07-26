import { z } from 'zod';

/**
 * Centralized, validated environment access.
 *
 * `serverEnv()` is lazily evaluated so importing this module never throws in
 * the browser bundle. Only call it from server components, route handlers,
 * services, or the worker.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_KEY: z.string().default('peon-auth-token'),

  /** Email of the Peon instance owner — only this user can edit global instance settings. */
  INSTANCE_OWNER_EMAIL: z.string().email().optional(),

  /**
   * Format is intentionally unvalidated here — see the superRefine note below.
   * Acceptability is decided at startup by `lib/crypto/preflight.ts`.
   */
  ENCRYPTION_KEY: z.string().min(1, 'ENCRYPTION_KEY is required'),
  /** Old key during rotation; decryption falls back to it. See docs/self-hosting.md. */
  ENCRYPTION_KEY_PREVIOUS: z.string().optional(),

  /** Google Identity Services client ID (no client secret needed for token login). */
  GOOGLE_CLIENT_ID: z.string().optional(),

  /** Email: `test` logs to console; `aws-ses` sends via Amazon SES. */
  EMAIL_DRIVER: z.enum(['test', 'aws-ses']).default('test'),
  EMAIL_FROM: z.string().default('no-reply@peon.local'),
  EMAIL_FROM_NAME: z.string().default('Peon'),

  /** Shared AWS region / credentials (SES, SQS, S3). */
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  /**
   * Queue transport. Omit to auto-detect: `sqs` when both SQS URLs are set
   * (so existing installations are never silently migrated), otherwise
   * `postgres`, which needs no AWS account.
   */
  QUEUE_DRIVER: z.enum(['sqs', 'postgres']).optional(),

  SQS_ENDPOINT: z.string().optional(),
  SQS_REGION: z.string().optional(),
  SQS_DEPLOYMENT_QUEUE_URL: z.string().optional(),
  SQS_TASKS_QUEUE_URL: z.string().optional(),

  WORKER_POLL_WAIT_SECONDS: z.coerce.number().default(20),
  WORKER_MAX_CONCURRENCY: z.coerce.number().default(5),

  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),

  /** Platform-managed GitHub App (Connect with Peon). */
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  /** PEM contents; `\n` may be escaped as `\\n` in env. */
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),

  /** WebSocket terminal sidecar (worker/terminal-server.ts). */
  TERMINAL_WS_PORT: z.coerce.number().default(8081),
  TERMINAL_SESSION_MAX_SECONDS: z.coerce.number().default(3600),

  SENTRY_DSN: z.string().optional(),

  /** Stripe Billing (optional — absent key disables paywalls for self-host). */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_LOOKUP_MONTHLY: z.string().default('peon_pro_monthly'),
  STRIPE_PRICE_LOOKUP_YEARLY: z.string().default('peon_pro_yearly'),
});

/** Placeholder shipped in `.env.example` — never valid in production. */
const PLACEHOLDER_JWT_SECRETS = new Set(['change-me-long-random-string']);

/**
 * Production-only secret hardening.
 *
 * **ENCRYPTION_KEY is deliberately NOT validated here.** This schema is
 * synchronous and has no database access, so it cannot tell a new installation
 * (where a weak key should be refused) from an upgrade of an existing one
 * (where refusing would make already-encrypted data unreadable). That decision
 * needs a database round-trip and lives in `lib/crypto/preflight.ts`.
 *
 * JWT_SECRET is different and *is* enforced here: rotating it only invalidates
 * sessions, so a hard failure costs users a re-login, never data.
 */
const serverSchemaChecked = serverSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  if (PLACEHOLDER_JWT_SECRETS.has(env.JWT_SECRET.trim())) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message:
        'JWT_SECRET is still the .env.example placeholder. Generate one with: openssl rand -hex 32',
    });
  }
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchemaChecked.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Clear cached env (tests). */
export function resetServerEnvCache(): void {
  cached = null;
}

export function platformGithubPrivateKeyPem(env: ServerEnv): string {
  return (env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
}

/** True when the instance-level Peon GitHub App is fully configured. */
export function isPlatformGithubConfigured(env?: ServerEnv): boolean {
  const e = env ?? serverEnv();
  return !!(
    e.GITHUB_APP_ID?.trim() &&
    e.GITHUB_APP_SLUG?.trim() &&
    e.GITHUB_APP_WEBHOOK_SECRET?.trim() &&
    e.GITHUB_APP_PRIVATE_KEY?.trim()
  );
}

/** True when Stripe secret is configured (Cloud billing / paywalls on). */
export function isBillingEnabled(env?: ServerEnv): boolean {
  const e = env ?? serverEnv();
  return !!(e.STRIPE_SECRET_KEY && e.STRIPE_SECRET_KEY.trim().length > 0);
}

/** Public (browser-safe) config. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  marketingUrl: (process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://peon.sh').replace(/\/$/, ''),
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  /** DigitalOcean referral link shown during onboarding. */
  doReferralUrl:
    process.env.NEXT_PUBLIC_DO_REFERRAL_URL ?? 'https://www.digitalocean.com/products/droplets',
  /** Optional full WebSocket URL for SSH terminal (e.g. wss://app.example.com/terminal/ws). */
  terminalWsUrl: process.env.NEXT_PUBLIC_TERMINAL_WS_URL ?? '',
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  /** Mirrors server `isBillingEnabled` for UI (publishable key present). */
  billingEnabled: !!(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').trim(),
};

/** Absolute URL into the marketing site (peon.sh). */
export function marketingHref(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${publicEnv.marketingUrl}${p}`;
}
