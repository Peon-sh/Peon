'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { getServiceLogArchives, getServiceLogs } from '@/services/api/service';
import { combineServiceLogs } from '@/lib/container-log-text';

export function LogsSection({ serviceId }: { serviceId: string }) {
  const [tail, setTail] = useState(200);
  const [follow, setFollow] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['service-logs', serviceId, tail],
    queryFn: () => getServiceLogs(serviceId, tail),
    refetchInterval: follow ? 5000 : false,
  });
  const archives = useQuery({
    queryKey: ['service-log-archives', serviceId],
    queryFn: () => getServiceLogArchives(serviceId),
    staleTime: 30_000,
  });

  const logText = combineServiceLogs(archives.data ?? [], data?.lines ?? []);

  useEffect(() => {
    if (follow) endRef.current?.scrollIntoView({ block: 'end' });
  }, [logText, follow]);

  const downloadLogs = async () => {
    setDownloading(true);
    try {
      const [full, previous] = await Promise.all([
        getServiceLogs(serviceId, 0),
        getServiceLogArchives(serviceId),
      ]);
      const blob = new Blob([combineServiceLogs(previous, full.lines)], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${full.container || serviceId}-logs.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to download logs');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-44">
            <SearchableSelect
              value={String(tail)}
              onValueChange={(v) => setTail(Number(v))}
              placeholder="Select log lines"
              size="sm"
              options={[100, 200, 500, 1000, 2000].map((n) => ({
                value: String(n),
                label: `Last ${n} lines`,
              }))}
            />
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Switch checked={follow} onCheckedChange={setFollow} /> Auto-refresh
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadLogs} disabled={downloading}>
            <Download className="size-3.5" /> Download full logs
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void refetch();
              void archives.refetch();
            }}
            disabled={isFetching}
          >
            <RotateCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="text-muted-foreground shrink-0 border-b px-4 py-2 text-sm">
          {data ? (
            <>
              Container <span className="text-foreground font-mono">{data.container}</span>
            </>
          ) : (
            'Logs'
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <pre
            className={`font-mono text-sm leading-relaxed whitespace-pre-wrap ${error ? 'text-destructive' : 'text-foreground'}`}
          >
            {error
              ? `Failed to fetch logs: ${error instanceof Error ? error.message : 'unknown error'}`
              : logText
                ? logText
                : isFetching
                  ? 'Loading logs…'
                  : 'No log output. Is the container running?'}
          </pre>
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
