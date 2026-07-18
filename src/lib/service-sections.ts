import {
  CalendarClock,
  DatabaseBackup,
  Globe,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Layers,
  ScrollText,
  Settings2,
  ShieldAlert,
  SquareTerminal,
  Webhook,
} from 'lucide-react';

export type ServiceSectionId =
  | 'overview'
  | 'configuration'
  | 'environment'
  | 'domains'
  | 'storage'
  | 'tasks'
  | 'backups'
  | 'deployments'
  | 'logs'
  | 'terminal'
  | 'webhooks'
  | 'danger';

export interface ServiceSection {
  id: ServiceSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}

/** Engines with a working dump/restore pipeline. */
export const BACKUPABLE_ENGINES = new Set(['POSTGRESQL', 'MYSQL', 'MARIADB', 'MONGODB']);

/**
 * Per-kind section navigation: databases get Backups and lose Scheduled
 * Tasks / Domains; everything else keeps the full set. Shared between the
 * app sidebar and the service detail page.
 */
export function sectionsForService(svc: {
  kind: string;
  databaseEngine: string | null;
}): ServiceSection[] {
  const isDb = svc.kind === 'DATABASE';
  const canBackup = isDb && !!svc.databaseEngine && BACKUPABLE_ENGINES.has(svc.databaseEngine);
  return [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'configuration', label: 'Configuration', icon: Settings2 },
    { id: 'environment', label: 'Environment', icon: KeyRound },
    { id: 'deployments', label: 'Deployments', icon: Layers },
    ...(isDb ? [] : [{ id: 'domains' as const, label: 'Domains', icon: Globe }]),
    { id: 'storage', label: 'Storage', icon: HardDrive },
    ...(isDb ? [] : [{ id: 'tasks' as const, label: 'Scheduled Tasks', icon: CalendarClock }]),
    ...(canBackup ? [{ id: 'backups' as const, label: 'Backups', icon: DatabaseBackup }] : []),
    { id: 'logs', label: 'Logs', icon: ScrollText },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'danger', label: 'Danger Zone', icon: ShieldAlert, danger: true },
  ];
}
