import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().min(1).max(80),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
