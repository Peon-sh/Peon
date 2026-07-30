import { z } from 'zod';
import { ENV_VAR_KEY, MAX_ENV_VAR_KEY_LENGTH } from '@/lib/env-var-key';

export const SHARED_VARIABLE_SCOPES = ['WORKSPACE', 'PROJECT', 'SERVER'] as const;

export const createSharedVariableSchema = z
  .object({
    scope: z.enum(SHARED_VARIABLE_SCOPES).default('WORKSPACE'),
    key: z
      .string()
      .min(1)
      .max(MAX_ENV_VAR_KEY_LENGTH)
      .regex(ENV_VAR_KEY, 'Must be a valid environment variable name'),
    value: z.string().max(100000),
    comment: z.string().max(500).nullable().optional(),
    isMultiline: z.boolean().optional(),
    isLiteral: z.boolean().optional(),
    projectId: z.string().min(1).nullable().optional(),
    serverId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.scope !== 'PROJECT' || !!v.projectId, {
    message: 'projectId is required for PROJECT scope',
    path: ['projectId'],
  })
  .refine((v) => v.scope !== 'SERVER' || !!v.serverId, {
    message: 'serverId is required for SERVER scope',
    path: ['serverId'],
  });

export const updateSharedVariableSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_ENV_VAR_KEY_LENGTH)
    .regex(ENV_VAR_KEY, 'Must be a valid environment variable name')
    .optional(),
  value: z.string().max(100000).optional(),
  comment: z.string().max(500).nullable().optional(),
  isMultiline: z.boolean().optional(),
  isLiteral: z.boolean().optional(),
});

export type CreateSharedVariableInput = z.infer<typeof createSharedVariableSchema>;
export type UpdateSharedVariableInput = z.infer<typeof updateSharedVariableSchema>;
