import { z } from 'zod';

const metricSchema = z.object({
  kind: z.literal('metric'),
  title: z.string().min(1).max(120),
  value: z.union([z.string(), z.number()]),
  status: z.enum(['ok', 'warn', 'error', 'neutral']).optional(),
  hint: z.string().max(200).optional(),
});

const statusListSchema = z.object({
  kind: z.literal('statusList'),
  title: z.string().min(1).max(120),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        status: z.enum(['ok', 'warn', 'error', 'neutral', 'running']),
        detail: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
});

const seriesPointSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.number().finite(),
});

const chartDatasetSchema = z.object({
  name: z.string().min(1).max(40),
  points: z.array(seriesPointSchema).min(1).max(40),
});

function chartRefine(
  value: { series?: unknown[]; datasets?: unknown[] },
  ctx: z.RefinementCtx,
) {
  if (!value.series?.length && !value.datasets?.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide series (single) or datasets (multi-series)',
      path: ['series'],
    });
  }
}

const barChartSchema = z
  .object({
    kind: z.literal('barChart'),
    title: z.string().min(1).max(120),
    /** Single series: [{ label, value }] */
    series: z.array(seriesPointSchema).min(1).max(40).optional(),
    /** Multi series, e.g. Successful vs Failed per day */
    datasets: z.array(chartDatasetSchema).min(1).max(6).optional(),
  })
  .superRefine(chartRefine);

const lineChartSchema = z
  .object({
    kind: z.literal('lineChart'),
    title: z.string().min(1).max(120),
    series: z.array(seriesPointSchema).min(1).max(60).optional(),
    datasets: z.array(chartDatasetSchema).min(1).max(6).optional(),
  })
  .superRefine(chartRefine);

const timelineSchema = z.object({
  kind: z.literal('timeline'),
  title: z.string().min(1).max(120),
  events: z
    .array(
      z.object({
        at: z.string().min(1).max(80),
        label: z.string().min(1).max(160),
        status: z.enum(['ok', 'warn', 'error', 'neutral', 'running']).optional(),
      }),
    )
    .min(1)
    .max(40),
});

export const chatVisualSchema = z.discriminatedUnion('kind', [
  metricSchema,
  statusListSchema,
  barChartSchema,
  lineChartSchema,
  timelineSchema,
]);

export type ChatVisual = z.infer<typeof chatVisualSchema>;

export type ChartVisual = Extract<ChatVisual, { kind: 'barChart' | 'lineChart' }>;

export function parseChatVisual(input: unknown): ChatVisual | null {
  const parsed = chatVisualSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Normalize single- or multi-series chart payloads for Recharts. */
export function chartRows(visual: ChartVisual): {
  data: Array<Record<string, string | number>>;
  keys: string[];
} {
  if (visual.datasets?.length) {
    const labels = [
      ...new Set(visual.datasets.flatMap((dataset) => dataset.points.map((point) => point.label))),
    ];
    const keys = visual.datasets.map((dataset) => dataset.name);
    const data = labels.map((label) => {
      const row: Record<string, string | number> = { label };
      for (const dataset of visual.datasets!) {
        row[dataset.name] =
          dataset.points.find((point) => point.label === label)?.value ?? 0;
      }
      return row;
    });
    return { data, keys };
  }

  return {
    data: (visual.series ?? []).map((point) => ({
      label: point.label,
      value: point.value,
    })),
    keys: ['value'],
  };
}
