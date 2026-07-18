import { z } from 'zod';

export const agentPushSchema = z.object({
  schema_version: z.literal(1),
  server_id: z.string().min(1),
  agent_version: z.string().min(1),
  sent_at: z.string().min(1),
  host: z.object({
    cpu_percent: z.number(),
    memory_percent: z.number(),
    disk_percent_root: z.number(),
    uptime_seconds: z.number(),
  }),
  containers: z
    .array(
      z.object({
        name: z.string(),
        state: z.string(),
        health: z.string().optional(),
        image: z.string(),
      }),
    )
    .default([]),
});

export type AgentPushInput = z.infer<typeof agentPushSchema>;
