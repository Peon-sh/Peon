'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  getService,
  listServices,
  type ServiceDetail,
  type ServiceListItem,
  type ServiceStatus,
} from '@/services/api/service';

/** Shared React Query keys — one cache for header, sidebar, and service pages. */
export const serviceQueryKeys = {
  detail: (serviceId: string) => ['service', serviceId] as const,
  list: (projectId: string) => ['services', projectId] as const,
};

/** Poll while status is transitional so UI catches worker updates. */
export function serviceStatusPollMs(status?: ServiceStatus | null): number | false {
  if (status === 'STARTING') return 2_000;
  return false;
}

export function patchServiceStatusInCache(
  qc: QueryClient,
  opts: { serviceId: string; projectId?: string | null; status: ServiceStatus },
) {
  qc.setQueryData<ServiceDetail>(serviceQueryKeys.detail(opts.serviceId), (prev) =>
    prev ? { ...prev, status: opts.status } : prev,
  );
  if (opts.projectId) {
    qc.setQueryData<ServiceListItem[]>(serviceQueryKeys.list(opts.projectId), (prev) =>
      prev?.map((s) => (s.id === opts.serviceId ? { ...s, status: opts.status } : s)),
    );
  }
}

export async function invalidateServiceQueries(
  qc: QueryClient,
  opts: { serviceId?: string; projectId?: string | null },
) {
  const tasks: Promise<unknown>[] = [];
  if (opts.serviceId) {
    tasks.push(qc.invalidateQueries({ queryKey: serviceQueryKeys.detail(opts.serviceId) }));
  }
  if (opts.projectId) {
    tasks.push(qc.invalidateQueries({ queryKey: serviceQueryKeys.list(opts.projectId) }));
  } else {
    tasks.push(qc.invalidateQueries({ queryKey: ['services'] }));
  }
  await Promise.all(tasks);
}

export function useServiceDetail(serviceId: string | undefined) {
  return useQuery({
    queryKey: serviceQueryKeys.detail(serviceId ?? ''),
    queryFn: () => getService(serviceId!),
    enabled: !!serviceId,
    refetchInterval: (query) => serviceStatusPollMs(query.state.data?.status),
  });
}

export function useProjectServices(projectId: string | undefined) {
  return useQuery({
    queryKey: serviceQueryKeys.list(projectId ?? ''),
    queryFn: () => listServices(projectId!),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const list = query.state.data;
      if (list?.some((s) => s.status === 'STARTING')) return 2_000;
      return false;
    },
  });
}
