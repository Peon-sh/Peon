'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartRows, type ChatVisual, type ChartVisual } from '@/services/internal/chat/visuals';
import { cn } from '@/lib/utils';

type Status = 'ok' | 'warn' | 'error' | 'neutral' | 'running';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const CHART_HEIGHT = 224;

function statusClass(status: Status | undefined): string {
  if (status === 'ok') return 'bg-success';
  if (status === 'warn') return 'bg-warning';
  if (status === 'error') return 'bg-destructive';
  if (status === 'running') return 'bg-info animate-status-pulse';
  return 'bg-muted-foreground';
}

function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div className="bg-card border-border rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <div
        className="bg-secondary/50 text-muted-foreground flex items-center justify-center rounded-md text-sm"
        style={{ height: CHART_HEIGHT }}
      >
        Preparing chart…
      </div>
    </div>
  );
}

/** Measure width once settled — skip ResponsiveContainer (React 19 update loops). */
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const next = Math.floor(element.getBoundingClientRect().width);
        if (next <= 0) return;
        // Ignore 1px scrollbar flicker that can thrash recharts.
        setWidth((prev) => (Math.abs(prev - next) < 2 ? prev : next));
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
    };
  }, []);

  return { ref, width };
}

const ChartBlock = memo(function ChartBlock({ visual }: { visual: ChartVisual }) {
  const { ref, width } = useChartWidth();
  const { data, keys } = useMemo(() => chartRows(visual), [visual]);
  const Chart = visual.kind === 'barChart' ? BarChart : LineChart;
  const multi = keys.length > 1 || keys[0] !== 'value';

  return (
    <div className="bg-card border-border rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-medium">{visual.title}</h3>
      <div ref={ref} className="w-full min-w-0 overflow-hidden" style={{ height: CHART_HEIGHT }}>
        {width > 0 && (
          <Chart
            width={width}
            height={CHART_HEIGHT}
            data={data}
            margin={{ top: 4, right: 8, bottom: multi ? 8 : 4, left: -16 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              allowDecimals={false}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {multi && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {visual.kind === 'barChart'
              ? keys.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={key === 'value' ? undefined : key}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                ))
              : keys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key === 'value' ? undefined : key}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2, fill: CHART_COLORS[index % CHART_COLORS.length] }}
                    isAnimationActive={false}
                  />
                ))}
          </Chart>
        )}
      </div>
    </div>
  );
});

export const VisualBlock = memo(
  function VisualBlock({
    visual,
    deferHeavy = false,
  }: {
    visual: ChatVisual;
    /** Skip Recharts while the assistant turn is still streaming. */
    deferHeavy?: boolean;
  }) {
    if (visual.kind === 'metric') {
      return (
        <div className="bg-card border-border rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{visual.title}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={cn('size-2 rounded-full', statusClass(visual.status))} />
            <span className="text-display font-semibold tabular-nums">{visual.value}</span>
          </div>
          {visual.hint && <p className="text-muted-foreground mt-1 text-sm">{visual.hint}</p>}
        </div>
      );
    }

    if (visual.kind === 'statusList') {
      return (
        <div className="bg-card border-border overflow-hidden rounded-lg border">
          <h3 className="border-border border-b px-4 py-3 text-sm font-medium">{visual.title}</h3>
          <div className="divide-border divide-y">
            {visual.items.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="flex items-center gap-2 px-4 py-2 text-base"
              >
                <span className={cn('size-2 rounded-full', statusClass(item.status))} />
                <span className="font-medium">{item.label}</span>
                {item.detail && (
                  <span className="text-muted-foreground ml-auto truncate text-sm">{item.detail}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (visual.kind === 'timeline') {
      return (
        <div className="bg-card border-border rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">{visual.title}</h3>
          <div className="space-y-0">
            {visual.events.map((event, index) => (
              <div key={`${event.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                {index < visual.events.length - 1 && (
                  <span className="bg-border absolute top-2 bottom-0 left-[3px] w-px" />
                )}
                <span
                  className={cn(
                    'relative mt-1 size-2 shrink-0 rounded-full',
                    statusClass(event.status),
                  )}
                />
                <div className="min-w-0 text-base">
                  <p className="font-medium">{event.label}</p>
                  <p className="text-muted-foreground text-sm">{event.at}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (deferHeavy) {
      return <ChartPlaceholder title={visual.title} />;
    }

    return <ChartBlock visual={visual} />;
  },
  (prev, next) =>
    prev.deferHeavy === next.deferHeavy &&
    JSON.stringify(prev.visual) === JSON.stringify(next.visual),
);
