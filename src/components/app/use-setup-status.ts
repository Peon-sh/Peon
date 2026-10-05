'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { deriveSetupSteps, type SetupStepsResult } from '@/lib/setup-steps';
import { listPrivateKeys } from '@/services/api/privatekey';
import { listServers } from '@/services/api/server';
import { listSources } from '@/services/api/sources';
import { listProjects } from '@/services/api/project';

// ── Per-workspace flags in localStorage (external store) ──
// peon.setupWizard.<ws>.githubSkipped   = '1'       → the GitHub step counts as satisfied

const githubSkippedKey = (wsId: string) => `peon.setupWizard.${wsId}.githubSkipped`;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('peon.setupWizard.')) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function readFlag(key: string, value: string): boolean {
  try {
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: string | null) {
  try {
    if (value !== null) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode): the flag just does not persist.
  }
  listeners.forEach((l) => l());
}

export function writeGithubSkipped(wsId: string) {
  writeFlag(githubSkippedKey(wsId), '1');
}

function useGithubSkipped(wsId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readFlag(githubSkippedKey(wsId), '1'),
    () => false,
  );
}

// ── Setup status ──

type Loaded<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

export type SetupStatus =
  | { loaded: false }
  | (SetupStepsResult & {
      loaded: true;
      keys: Loaded<typeof listPrivateKeys>;
      servers: Loaded<typeof listServers>;
      sources: Loaded<typeof listSources>;
      projects: Loaded<typeof listProjects>;
      githubConnected: boolean;
      /** Skipped and not connected: the step counts as satisfied but shows "Skipped". */
      githubSkipped: boolean;
    });

/**
 * Onboarding completion for a workspace, derived from React Query data every render.
 * A skipped GitHub step counts as satisfied, so the wizard hides once key, server and project exist.
 */
export function useSetupStatus(wsId: string): SetupStatus {
  const enabled = !!wsId;
  const { data: keys } = useQuery({
    queryKey: ['private-keys', wsId],
    queryFn: () => listPrivateKeys(wsId),
    enabled,
  });
  const { data: servers } = useQuery({
    queryKey: ['servers', wsId],
    queryFn: () => listServers(wsId),
    enabled,
  });
  const { data: sources } = useQuery({
    queryKey: ['sources', wsId],
    queryFn: () => listSources(wsId),
    enabled,
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', wsId],
    queryFn: () => listProjects(wsId),
    enabled,
  });
  const skippedFlag = useGithubSkipped(wsId);

  if (!keys || !servers || !sources || !projects) return { loaded: false };

  const githubConnected = sources.github.some((s) => s.status === 'CONNECTED');
  const githubSkipped = skippedFlag && !githubConnected;
  const result = deriveSetupSteps({
    keys: keys.length,
    servers: servers.length,
    githubConnected: githubConnected || githubSkipped,
    projects: projects.length,
  });
  return { ...result, loaded: true, keys, servers, sources, projects, githubConnected, githubSkipped };
}
