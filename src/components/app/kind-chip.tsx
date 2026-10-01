import { cn } from '@/lib/utils';

const KIND: Record<string, { label: string; className: string }> = {
  GIT_APP: { label: 'Git app', className: 'bg-primary/10 text-primary' },
  DOCKER_IMAGE: { label: 'Image', className: 'bg-warning/10 text-warning' },
  DATABASE: { label: 'Database', className: 'bg-info/10 text-info' },
  COMPOSE: { label: 'Compose', className: 'bg-success/10 text-success' },
  STATIC: { label: 'Static', className: 'bg-secondary text-foreground' },
};

const ROLE: Record<string, { label: string; className: string }> = {
  OWNER: { label: 'Owner', className: 'bg-primary/10 text-primary' },
  ADMIN: { label: 'Admin', className: 'bg-info/10 text-info' },
  BILLING_ADMIN: { label: 'Billing admin', className: 'bg-warning/10 text-warning' },
  MEMBER: { label: 'Member', className: 'bg-secondary text-muted-foreground' },
};

function sentence(s: string) {
  const w = s.toLowerCase().replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

const BASE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function KindChip({ kind, className }: { kind: string; className?: string }) {
  const k = KIND[kind.toUpperCase()];
  return <span className={cn(BASE, k?.className ?? 'bg-secondary text-muted-foreground', className)}>{k?.label ?? sentence(kind)}</span>;
}

export function RolePill({ role, className }: { role: string; className?: string }) {
  const r = ROLE[role.toUpperCase()];
  return <span className={cn(BASE, r?.className ?? 'bg-secondary text-muted-foreground', className)}>{r?.label ?? sentence(role)}</span>;
}
