'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, unwrap } from '@/lib/http/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';

/**
 * First-administrator setup.
 *
 * Reached from the one-time link the installer prints. Exists so a fresh
 * installation can create its first account before email is configured, without
 * shipping default credentials.
 */
export default function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [useLocalServer, setUseLocalServer] = useState(true);

  useEffect(() => {
    let cancelled = false;
    unwrap<{ valid: boolean }>(api.get(`/setup?token=${encodeURIComponent(token)}`))
      .then((res) => {
        if (!cancelled) setValid(res.valid);
      })
      .catch(() => {
        if (!cancelled) setValid(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await unwrap(api.post('/setup', { token, ...form, useLocalServer }));
      // Cookie is set by the API; land on onboarding.
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground animate-pulse text-sm">Checking your setup link…</p>
      </main>
    );
  }

  if (!valid) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <Logo className="mx-auto h-8" />
          <h1 className="text-xl font-semibold">This setup link is not usable</h1>
          <p className="text-muted-foreground text-sm">
            It has expired, has already been used, or this instance already has an
            administrator.
          </p>
          <div className="text-muted-foreground rounded-md border p-4 text-left text-xs">
            <p className="mb-2">To issue a new link, run on the server:</p>
            <code className="block font-mono">
              cd /opt/peon &amp;&amp; docker compose exec app pnpm bootstrap:admin
            </code>
          </div>
          <Button variant="outline" onClick={() => router.push('/login')}>
            Go to sign in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <Logo className="mx-auto h-8" />
          <h1 className="text-xl font-semibold">Create your administrator account</h1>
          <p className="text-muted-foreground text-sm">
            This is the first account on this Peon installation. It will be the
            instance owner.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Not verified by email — the setup link already proves you control
              this server. Configure SMTP afterwards for invitations and password
              reset.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">At least 8 characters.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Where should your apps run?</legend>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary">
              <input
                type="radio"
                name="placement"
                className="mt-0.5"
                checked={useLocalServer}
                onChange={() => setUseLocalServer(true)}
              />
              <span className="text-sm">
                <span className="font-medium">On this server</span>
                <span className="text-muted-foreground block text-xs">
                  Peon and your apps share this machine. Simplest to start with.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary">
              <input
                type="radio"
                name="placement"
                className="mt-0.5"
                checked={!useLocalServer}
                onChange={() => setUseLocalServer(false)}
              />
              <span className="text-sm">
                <span className="font-medium">On separate servers only</span>
                <span className="text-muted-foreground block text-xs">
                  Keep this machine as a control plane. Add servers over SSH
                  afterwards.
                </span>
              </span>
            </label>

            <p className="text-muted-foreground pt-1 text-xs">
              Not a permanent choice — you can add remote servers later either
              way, and run both together.
            </p>
          </fieldset>
        </div>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </main>
  );
}
