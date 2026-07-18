import { cn } from '@/lib/utils';

/**
 * Service kind chips ("git app", "database", "compose", "image", "static")
 * and workspace role pills ("owner", "admin", "billing admin", "member"),
 * colored per the design system's signal palette.
 */

const KIND_STYLES: Record<string, string> = {
  GIT_APP: 'text-phosphor border-phosphor-dim',
  DOCKER_IMAGE: 'text-warning border-warning/30',
  DATABASE: 'text-info border-info/30',
  COMPOSE: 'text-violet border-violet/30',
  STATIC: 'text-foreground',
};

const KIND_LABELS: Record<string, string> = {
  GIT_APP: 'git app',
  DOCKER_IMAGE: 'image',
  DATABASE: 'database',
  COMPOSE: 'compose',
  STATIC: 'static',
};

export function KindChip({ kind, className }: { kind: string; className?: string }) {
  const key = kind.toUpperCase();
  return (
    <span
      className={cn(
        'bg-secondary text-muted-foreground inline-block rounded-full border px-2 py-0.5 text-[11px]',
        KIND_STYLES[key],
        className,
      )}
    >
      {KIND_LABELS[key] ?? kind.toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}

const ROLE_STYLES: Record<string, string> = {
  OWNER: 'text-phosphor border-phosphor-dim',
  ADMIN: 'text-info border-info/30',
  BILLING_ADMIN: 'text-warning border-warning/30',
  MEMBER: 'text-muted-foreground',
};

export function RolePill({ role, className }: { role: string; className?: string }) {
  const key = role.toUpperCase();
  return (
    <span
      className={cn(
        'bg-secondary text-muted-foreground inline-block rounded-sm border px-2 py-0.5 text-[11px]',
        ROLE_STYLES[key],
        className,
      )}
    >
      {role.toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
