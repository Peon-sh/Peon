import { z } from 'zod';

export const createStorageSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  region: z.string().min(1).max(80).default('us-east-1'),
  endpoint: z.string().max(255).nullable().optional(),
  bucket: z.string().min(1).max(255),
  accessKey: z.string().min(1).max(1000),
  secretKey: z.string().min(1).max(1000),
});

export const updateStorageSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  region: z.string().min(1).max(80).optional(),
  endpoint: z.string().max(255).nullable().optional(),
  bucket: z.string().min(1).max(255).optional(),
  accessKey: z.string().min(1).max(1000).optional(),
  secretKey: z.string().min(1).max(1000).optional(),
});

export type CreateStorageInput = z.infer<typeof createStorageSchema>;
export type UpdateStorageInput = z.infer<typeof updateStorageSchema>;
