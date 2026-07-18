import { z } from 'zod';

const githubBase = {
  name: z.string().min(1).max(80),
  organization: z.string().max(120).nullable().optional(),
  apiUrl: z.string().url().max(255).optional(),
  htmlUrl: z.string().url().max(255).optional(),
  customUser: z.string().min(1).max(80).optional(),
  customPort: z.number().int().min(1).max(65535).optional(),
  appId: z.string().max(120).nullable().optional(),
  installationId: z.string().max(120).nullable().optional(),
  clientId: z.string().max(255).nullable().optional(),
  clientSecret: z.string().max(1000).nullable().optional(),
  webhookSecret: z.string().max(1000).nullable().optional(),
  privateKeyId: z.string().min(1).nullable().optional(),
  isSystemWide: z.boolean().optional(),
  isPublic: z.boolean().optional(),
};

const gitlabBase = {
  name: z.string().min(1).max(80),
  organization: z.string().max(120).nullable().optional(),
  apiUrl: z.string().url().max(255).optional(),
  htmlUrl: z.string().url().max(255).optional(),
  customUser: z.string().min(1).max(80).optional(),
  customPort: z.number().int().min(1).max(65535).optional(),
  appId: z.string().max(120).nullable().optional(),
  appSecret: z.string().max(1000).nullable().optional(),
  oauthId: z.number().int().nullable().optional(),
  groupName: z.string().max(120).nullable().optional(),
  webhookToken: z.string().max(1000).nullable().optional(),
  privateKeyId: z.string().min(1).nullable().optional(),
  isSystemWide: z.boolean().optional(),
  isPublic: z.boolean().optional(),
};

export const createSourceSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('github'), ...githubBase }),
  z.object({ provider: z.literal('gitlab'), ...gitlabBase }),
]);

export const updateGithubSourceSchema = z.object(githubBase).partial();
export const updateGitlabSourceSchema = z.object(gitlabBase).partial();

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateGithubSourceInput = z.infer<typeof updateGithubSourceSchema>;
export type UpdateGitlabSourceInput = z.infer<typeof updateGitlabSourceSchema>;
