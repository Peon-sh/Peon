import { z } from 'zod';
import { isValidSshHost, normalizeSshHost } from '@/lib/ssh/host';
import { normalizeHostKeyFingerprint } from '@/lib/ssh/host-key';

// ---- Private keys ----
export const createPrivateKeySchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(500).optional(),
    // When provided, the pasted private key is used; otherwise a new keypair is generated.
    privateKey: z.string().min(1).optional(),
    publicKey: z.string().min(1).optional(),
    generate: z.boolean().optional(),
  })
  .refine((v) => v.generate || !!v.privateKey, {
    message: 'Provide a private key or choose to generate one.',
    path: ['privateKey'],
  });

// ---- API tokens ----
export const createTokenSchema = z.object({
  name: z.string().min(1).max(80),
  expiresAt: z.string().datetime().optional(),
});

// ---- Servers ----
/** SSH host: IPv4, IPv6, or DNS hostname (normalized before store / connect). */
const serverHostSchema = z
  .string()
  .trim()
  .min(1, 'Enter an IPv4, IPv6, or hostname')
  .max(255)
  .transform(normalizeSshHost)
  .refine(isValidSshHost, {
    message: 'Enter a valid IPv4, IPv6, or DNS hostname',
  });

/**
 * Optional SSH host key pin. Accepts `SHA256:…`, the bare base64 digest, or a
 * whole `ssh-keygen -lf` line. Left unset, the key is recorded on first connect.
 */
const hostKeyFingerprintSchema = z
  .string()
  .trim()
  .max(200)
  .transform(normalizeHostKeyFingerprint)
  .refine((v): v is string => v !== null, {
    message: 'Enter a SHA256 host key fingerprint, e.g. SHA256:abc… (MD5 fingerprints are not supported)',
  });

export const createServerSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  ip: serverHostSchema,
  port: z.number().int().min(1).max(65535).default(22),
  user: z.string().min(1).max(80).default('root'),
  privateKeyId: z.string().min(1),
  proxyType: z.enum(['TRAEFIK', 'CADDY', 'NONE']).default('TRAEFIK'),
  hostKeyFingerprint: hostKeyFingerprintSchema.optional(),
});

export const updateServerSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  ip: serverHostSchema.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(80).optional(),
  privateKeyId: z.string().min(1).nullable().optional(),
  proxyType: z.enum(['TRAEFIK', 'CADDY', 'NONE']).optional(),
  /** Explicit null clears the trusted key, so a rebuilt server can be re-trusted. */
  hostKeyFingerprint: hostKeyFingerprintSchema.nullable().optional(),
  isBuildServer: z.boolean().optional(),
  forceDisabled: z.boolean().optional(),
  wildcardDomain: z.string().max(255).nullable().optional(),
  connectionTimeout: z.number().int().min(1).max(300).optional(),
  concurrentBuilds: z.number().int().min(1).max(50).optional(),
  deploymentQueueLimit: z.number().int().min(1).max(500).optional(),
  isMetricsEnabled: z.boolean().optional(),
  isSentinelEnabled: z.boolean().optional(),
  isTerminalEnabled: z.boolean().optional(),
  isCloudflareTunnel: z.boolean().optional(),
  forceDockerCleanup: z.boolean().optional(),
  dockerCleanupFrequency: z.string().max(80).optional(),
  dockerCleanupThreshold: z.number().int().min(1).max(100).optional(),
  deleteUnusedVolumes: z.boolean().optional(),
  deleteUnusedNetworks: z.boolean().optional(),
  diskUsageNotificationThreshold: z.number().int().min(1).max(100).optional(),
});

export const deleteServerSchema = z.object({
  confirmName: z.string().min(1).max(80),
  deleteResources: z.boolean().default(false),
});

export const proxyActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
});

/** Optional connection fields persisted before a validate/reconnect job. */
export const validateServerSchema = z.object({
  ip: serverHostSchema.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).max(80).optional(),
  privateKeyId: z.string().min(1).nullable().optional(),
  connectionTimeout: z.number().int().min(1).max(300).optional(),
  installDocker: z.boolean().optional(),
});

export const createDestinationSchema = z.object({
  name: z.string().min(1).max(80),
  network: z.string().min(1).max(80).default('peon'),
  isSwarm: z.boolean().default(false),
});

export type CreatePrivateKeyInput = z.infer<typeof createPrivateKeySchema>;
export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type DeleteServerInput = z.infer<typeof deleteServerSchema>;
export type ValidateServerInput = z.infer<typeof validateServerSchema>;
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
