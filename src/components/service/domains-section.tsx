'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, CalloutBullets } from '@/components/app/callout';
import { updateService, type ServiceDetail } from '@/services/api/service';
import { FormSection } from '@/components/app/page';
import { ConfirmButton } from '@/components/app/confirm';
import { Field, ToggleField } from './fields';

/**
 * Multi-domain editor with add/remove rows. Persists as comma-separated fqdn.
 */
function parseDomains(fqdn: string): string[] {
  return fqdn
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

function DomainsField({
  serviceId,
  value,
  onChange,
}: {
  serviceId: string;
  value: string;
  onChange: (fqdn: string | null) => void;
}) {
  const [domains, setDomains] = useState<string[]>(() => {
    const parsed = parseDomains(value);
    return parsed.length ? parsed : [''];
  });
  const [prevServiceId, setPrevServiceId] = useState(serviceId);

  if (serviceId !== prevServiceId) {
    setPrevServiceId(serviceId);
    const parsed = parseDomains(value);
    setDomains(parsed.length ? parsed : ['']);
  }

  const commit = (next: string[]) => {
    const rows = next.length ? next : [''];
    setDomains(rows);
    const joined = rows.map((d) => d.trim()).filter(Boolean);
    onChange(joined.length ? joined.join(',') : null);
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {domains.map((domain, i) => (
          <div key={i} className="flex gap-2">
            <Input
              className="min-w-0 flex-1"
              placeholder="https://app.example.com"
              value={domain}
              onChange={(e) => {
                const next = [...domains];
                next[i] = e.target.value;
                commit(next);
              }}
            />
            {domains.length > 1 && (
              <ConfirmButton
                title="Remove this domain?"
                description="It will be removed from the form. Save the service for the change to take effect."
                confirmLabel="Remove"
                size="icon-sm"
                onConfirm={() => {
                  const next = domains.filter((_, idx) => idx !== i);
                  commit(next.length ? next : ['']);
                }}
              >
                <Trash2 className="size-3.5" />
                <span className="sr-only">Remove domain</span>
              </ConfirmButton>
            )}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => commit([...domains, ''])}
      >
        Add domain
      </Button>
    </div>
  );
}

function DnsRecordField({
  label,
  value,
  onCopy,
  copyEnabled = true,
  emphasis = false,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copyEnabled?: boolean;
  /** Highlight fields users actually need to copy (host, value) over ones they rarely touch (type, ttl). */
  emphasis?: boolean;
}) {
  if (emphasis) {
    return (
      <div className="border-primary/30 bg-primary/5 hover:bg-primary/10 min-w-0 space-y-1.5 rounded-md border px-3 py-3 transition-colors">
        <div className="text-primary text-xs font-medium">{label}</div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="text-foreground text-md min-w-0 font-mono font-medium leading-snug break-all">
            {value}
          </span>
          {onCopy && copyEnabled ? (
            <button
              type="button"
              onClick={onCopy}
              className="text-primary bg-primary/10 hover:bg-primary/20 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors"
              title={`Copy ${label}`}
            >
              <Copy className="size-3.5" />
              Copy
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-secondary/40 min-w-0 space-y-1 rounded-md border px-3 py-2.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="text-foreground min-w-0 font-mono text-base leading-relaxed break-all">
          {value}
        </span>
        {onCopy && copyEnabled ? (
          <button
            type="button"
            onClick={onCopy}
            className="text-muted-foreground hover:text-primary shrink-0 transition-colors"
            title={`Copy ${label}`}
          >
            <Copy className="size-3.5" />
            <span className="sr-only">Copy {label}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DnsGuide({ serverIp, domain }: { serverIp?: string | null; domain?: string }) {
  const host = domain?.replace(/^https?:\/\//, '').split('/')[0] || 'app.example.com';
  const parts = host.split('.');
  const sub = parts.length > 2 ? parts.slice(0, -2).join('.') : '@';
  const ip = serverIp || '<your-server-ip>';
  const ttl = 'Auto / 300';

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <div className="space-y-3">
      <div className="border-border bg-card space-y-3 rounded-lg border p-3">
        <div className="space-y-0.5">
          <div className="text-base font-medium">DNS record</div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Create this record at your DNS provider for{' '}
            <span className="text-foreground break-all font-mono">{host}</span>
          </p>
        </div>
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <DnsRecordField label="Name / Host" value={sub} onCopy={() => copy(sub)} emphasis />
            <DnsRecordField
              label="Value / Points to"
              value={ip}
              onCopy={() => serverIp && copy(serverIp)}
              copyEnabled={!!serverIp}
              emphasis
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DnsRecordField label="Type" value="A" onCopy={() => copy('A')} />
            <DnsRecordField label="TTL" value={ttl} onCopy={() => copy(ttl)} />
          </div>
        </div>
      </div>

      <Callout tone="info" title="Need help pointing your domain?">
        <CalloutBullets>
          <li>
            The value must be the public IP of the server this service is deployed to
            {serverIp ? '' : ' — assign a server first to see it here'}.
          </li>
          <li>
            Hosting many services on this server? Add a wildcard record instead (
            <span className="font-mono">*</span> →{' '}
            <span className="font-mono break-all">{ip}</span>) and every subdomain will just work.
          </li>
          <li>
            Using Cloudflare? Set the record to <b>DNS only</b> (grey cloud) until the first deploy
            completes, so the HTTPS certificate can be issued.
          </li>
          <li>
            HTTPS is automatic — a Let&apos;s Encrypt certificate is issued on the first request once
            DNS resolves. Propagation usually takes a few minutes.
          </li>
        </CalloutBullets>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0">Verify:</span>
          <button
            type="button"
            onClick={() => copy(`dig +short ${host}`)}
            className="bg-secondary hover:text-primary inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm transition-colors"
            title="Copy command"
          >
            <span className="min-w-0 break-all">dig +short {host}</span>
            <Copy className="size-3 shrink-0" />
          </button>
          <span className="break-all">should print {ip}</span>
        </div>
      </Callout>
    </div>
  );
}

/**
 * Wildcard-DNS guidance for preview deployments using the server wildcard domain.
 * FQDN pattern: `{shortCommitSha}.{wildcardHost}` e.g. `abc1234.preview.peon.sh`.
 */
export function PreviewDnsGuide({
  serverIp,
  wildcardDomain,
}: {
  serverIp?: string | null;
  wildcardDomain?: string | null;
}) {
  const raw = wildcardDomain?.replace(/^https?:\/\//, '').replace(/^\*\./, '').split('/')[0] || null;
  const host = raw || 'preview.example.com';
  const exampleFqdn = `abc1234.${host}`;
  const ip = serverIp || '<your-server-ip>';

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  return (
    <Callout tone="info" title="DNS setup for preview deployments (server wildcard)">
      <p>
        Previews use your <b>server wildcard domain</b>: each PR commit gets{' '}
        <span className="text-foreground font-mono">{exampleFqdn}</span>. Point a wildcard A record
        at this server:
      </p>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-105 text-left">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 pr-4">Type</th>
              <th className="py-1 pr-4">Name / Host</th>
              <th className="py-1 pr-4">Value / Points to</th>
              <th className="py-1">TTL</th>
            </tr>
          </thead>
          <tbody className="text-foreground font-mono text-sm">
            <tr>
              <td className="py-1 pr-4">A</td>
              <td className="py-1 pr-4">*.{host}</td>
              <td className="py-1 pr-4">
                <button
                  type="button"
                  onClick={() => serverIp && copy(serverIp)}
                  className="hover:text-primary inline-flex items-center gap-1.5 transition-colors"
                  title="Copy IP"
                >
                  {ip}
                  {serverIp && <Copy className="size-3" />}
                </button>
              </td>
              <td className="py-1">Auto / 300</td>
            </tr>
          </tbody>
        </table>
      </div>
      <CalloutBullets>
        <li>
          Set the same base on the server under <b>Wildcard domain</b> (e.g.{' '}
          <span className="font-mono">https://{host}</span>).
        </li>
        <li>
          Enable <b>Preview deployments</b> below. PRs targeting this service&apos;s branch get a
          sticky GitHub comment with build status and the preview URL.
        </li>
        <li>
          On Cloudflare, keep the wildcard record <b>DNS only</b> (grey cloud) so Let&apos;s Encrypt
          HTTP-01 works.
        </li>
        <li>Preview containers run alongside production — they never replace it.</li>
      </CalloutBullets>
      {!wildcardDomain && (
        <p className="text-warning mt-2 text-sm">
          This server has no wildcard domain yet — set one before enabling preview deployments.
        </p>
      )}
    </Callout>
  );
}

export function DomainsSection({
  svc,
  onSaved,
  onSettingsChanged,
}: {
  svc: ServiceDetail;
  onSaved: () => void;
  onSettingsChanged: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const val = <T,>(k: keyof ServiceDetail, fallback: T): T =>
    (form[k as string] as T) ?? ((svc[k] as T) ?? fallback);
  const settingVal = <T,>(k: keyof NonNullable<ServiceDetail['settings']>, fallback: T): T =>
    (form[k as string] as T) ?? ((svc.settings?.[k] as T) ?? fallback);

  const saveMut = useMutation({
    mutationFn: () => updateService(svc.id, form),
    onSuccess: async () => {
      setForm({});
      onSaved();
      toast.success('Saved');
      onSettingsChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  const dirty = Object.keys(form).length > 0;

  return (
    <div id="domains" className="space-y-4">
      <FormSection
        title="Domains"
        description="Hostnames this service answers on. HTTPS certificates are issued automatically."
        footer={
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            Save
          </Button>
        }
      >
        <Field label="Domains">
          <DomainsField
            serviceId={svc.id}
            value={val('fqdn', '') ?? ''}
            onChange={(v) => set('fqdn', v)}
          />
        </Field>
        <DnsGuide serverIp={svc.server?.ip} domain={parseDomains(val('fqdn', '') ?? '')[0]} />
        <>
          <ToggleField
            label="Force HTTPS"
            checked={settingVal('isForceHttpsEnabled', true)}
            onCheckedChange={(c) => set('isForceHttpsEnabled', c)}
          />
          <ToggleField
            label="Gzip compression"
            checked={settingVal('isGzipEnabled', true)}
            onCheckedChange={(c) => set('isGzipEnabled', c)}
          />
          <ToggleField
            label="Strip prefix"
            checked={settingVal('isStripprefixEnabled', false)}
            onCheckedChange={(c) => set('isStripprefixEnabled', c)}
          />
        </>
      </FormSection>
    </div>
  );
}
