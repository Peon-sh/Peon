'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Trash2, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  runTask,
  listTaskExecutions,
  type ScheduledTaskItem,
} from '@/services/api/service';
import { FormField, FormSection } from '@/components/app/page';
import { DataTable } from '@/components/app/data-table';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm';
import { StatusBadge, statusLabel } from '@/components/app/status-badge';
import { RunOutput } from '@/components/app/run-output';
import { LocalDateTime } from '@/components/app/local-datetime';
import { formatLocalDateTime } from '@/lib/datetime';

export function TasksSection({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ['tasks', serviceId],
    queryFn: () => listTasks(serviceId),
    refetchInterval: 10_000,
  });
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [frequency, setFrequency] = useState('0 0 * * *');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', serviceId] });

  const addMut = useMutation({
    mutationFn: () => createTask(serviceId, { name, command, frequency }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      setCommand('');
      toast.success('Task created');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  return (
    <div className="space-y-4">
      <FormSection
        title="New scheduled task"
        description="Runs inside the service container on a cron schedule."
        footer={
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!name || !command || !frequency || addMut.isPending}>
            Add task
          </Button>
        }
      >
        <FormField label="Name" htmlFor="task-name">
          <Input id="task-name" placeholder="cleanup-cache" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Frequency (cron)" htmlFor="task-freq">
          <Input
            id="task-freq"
            className="font-mono"
            placeholder="0 0 * * *"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          />
        </FormField>
        <FormField label="Command" htmlFor="task-cmd" description="Runs inside the container.">
          <Input
            id="task-cmd"
            className="font-mono"
            placeholder="pnpm run scheduler:clean"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </FormField>
      </FormSection>

      {tasks?.length ? (
        tasks.map((t) => <TaskEditor key={t.id} serviceId={serviceId} task={t} />)
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="No scheduled tasks"
          description="Add one above. It runs inside the service container on a cron schedule."
        />
      )}
    </div>
  );
}

function TaskEditor({ serviceId, task }: { serviceId: string; task: ScheduledTaskItem }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const val = <T,>(k: keyof ScheduledTaskItem, fallback: T): T =>
    (form[k as string] as T) ?? ((task[k] as T) ?? fallback);
  const dirty = Object.keys(form).length > 0;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks', serviceId] });

  const saveMut = useMutation({
    mutationFn: () => updateTask(serviceId, task.id, form),
    onSuccess: async () => {
      await invalidate();
      setForm({});
      toast.success('Task saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const toggleMut = useMutation({
    mutationFn: () => updateTask(serviceId, task.id, { enabled: !task.enabled }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const runMut = useMutation({
    mutationFn: () => runTask(serviceId, task.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task queued - check executions shortly');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: () => deleteTask(serviceId, task.id),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <FormSection
      title={
        <span className="inline-flex items-center gap-2">
          {task.name}
          {!task.enabled && <Badge variant="outline">Disabled</Badge>}
        </span>
      }
      footer={
        <>
          <ConfirmButton
            size="sm"
            onConfirm={() => delMut.mutate()}
            title={`Delete task "${task.name}"?`}
            description="The schedule and its execution history will be permanently removed."
            disabled={delMut.isPending}
            className="mr-auto"
          >
            <Trash2 className="size-3.5" /> Delete
          </ConfirmButton>
          <Button size="sm" variant="outline" onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}>
            {task.enabled ? 'Disable task' : 'Enable task'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <Play className="size-3.5" /> Execute now
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            Save
          </Button>
        </>
      }
    >
      <FormField label="Name" htmlFor={`task-${task.id}-name`}>
        <Input id={`task-${task.id}-name`} value={val('name', '')} onChange={(e) => set('name', e.target.value)} />
      </FormField>
      <FormField label="Frequency (cron)" htmlFor={`task-${task.id}-frequency`}>
        <Input
          id={`task-${task.id}-frequency`}
          className="font-mono"
          value={val('frequency', '')}
          onChange={(e) => set('frequency', e.target.value)}
        />
      </FormField>
      <FormField label="Timeout (seconds)" htmlFor={`task-${task.id}-timeout`}>
        <Input
          id={`task-${task.id}-timeout`}
          type="number"
          value={String(val('timeout', 300))}
          onChange={(e) => set('timeout', Number(e.target.value) || 300)}
        />
      </FormField>
      <FormField label="Container name" htmlFor={`task-${task.id}-container`}>
        <Input
          id={`task-${task.id}-container`}
          placeholder="Defaults to the service container"
          value={val('container', '') ?? ''}
          onChange={(e) => set('container', e.target.value || null)}
        />
      </FormField>
      <FormField label="Command" htmlFor={`task-${task.id}-command`}>
        <Input
          id={`task-${task.id}-command`}
          className="font-mono"
          value={val('command', '')}
          onChange={(e) => set('command', e.target.value)}
        />
      </FormField>

      <TaskExecutions serviceId={serviceId} task={task} />
    </FormSection>
  );
}

function TaskExecutions({ serviceId, task }: { serviceId: string; task: ScheduledTaskItem }) {
  const [open, setOpen] = useState(false);
  const {
    data: executions,
    isPending: executionsPending,
    isError: executionsIsError,
    error: executionsError,
  } = useQuery({
    queryKey: ['task-executions', task.id],
    queryFn: () => listTaskExecutions(serviceId, task.id),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const last = task.executions[0];

  return (
    <div className="text-sm">
      <button onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground transition-colors">
        {task._count.executions} execution{task._count.executions === 1 ? '' : 's'}
        {last ? ` · last: ${statusLabel(last.status)} ${formatLocalDateTime(last.startedAt)}` : ''}
        {open ? ' ▲' : ' ▼'}
      </button>
      {open &&
        (executionsIsError ? (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{executionsError instanceof Error ? executionsError.message : 'Failed to load executions'}</AlertDescription>
          </Alert>
        ) : (
          <DataTable
            className="mt-2"
            rows={executions ?? []}
            rowKey={(e) => e.id}
            isLoading={executionsPending}
            emptyState={<p className="text-muted-foreground mt-2">No executions yet.</p>}
            columns={[
              { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
              {
                key: 'started',
                header: 'Started',
                className: 'whitespace-nowrap',
                cell: (e) => (
                  <span className="text-muted-foreground tabular-nums">
                    <LocalDateTime value={e.startedAt} />
                  </span>
                ),
              },
              {
                key: 'duration',
                header: 'Duration',
                cell: (e) => (
                  <span className="text-muted-foreground tabular-nums">
                    {e.duration != null ? `${(e.duration / 1000).toFixed(1)}s` : '—'}
                  </span>
                ),
              },
              {
                key: 'output',
                header: 'Output',
                className: 'w-full max-w-0 whitespace-normal',
                cell: (e) => <RunOutput message={e.message} />,
              },
            ]}
          />
        ))}
    </div>
  );
}
