'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPrivateKey, type PrivateKeyDetail } from '@/services/api/privatekey';
import { startGithubConnect } from '@/services/api/sources';
import { createProject } from '@/services/api/project';

/** Step 1: generate an SSH key, then show its public half to install on the server. */
export function KeyStep({
  workspaceId: wsId,
  publicKey,
  onCreated,
  onContinue,
}: {
  workspaceId: string;
  /** Public key of the key generated in this wizard session, if any. */
  publicKey: string | null;
  onCreated: (key: PrivateKeyDetail) => void;
  onContinue: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  const createMut = useMutation({
    mutationFn: () => createPrivateKey(wsId, { name: name.trim() || 'default', generate: true }),
    onSuccess: async (key) => {
      await qc.invalidateQueries({ queryKey: ['private-keys', wsId] });
      setName('');
      onCreated(key);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create SSH key'),
  });

  const copy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      toast.success('Public key copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy public key');
    }
  };

  if (publicKey) {
    return (
      <div className="space-y-3">
        <div className="bg-secondary break-all rounded-md p-3 font-mono text-xs">{publicKey}</div>
        <p className="text-muted-foreground text-sm">
          Add this public key to ~/.ssh/authorized_keys on your server, then continue.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wizard-key-name">Name</Label>
        <Input
          id="wizard-key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. production"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          {createMut.isPending ? 'Generating…' : 'Generate key'}
        </Button>
        <Link href="/keys-and-tokens" className="text-primary text-sm underline-offset-2 hover:underline">
          Paste an existing key instead
        </Link>
      </div>
    </div>
  );
}

/** Step 3: connect the platform GitHub App, or point at Git sources when it is not configured. */
export function GithubStep({
  workspaceId: wsId,
  platformConfigured,
  onSkip,
}: {
  workspaceId: string;
  platformConfigured: boolean;
  onSkip: () => void;
}) {
  const connectMut = useMutation({
    mutationFn: () => startGithubConnect(wsId),
    onSuccess: ({ installUrl }) => {
      window.location.href = installUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to start GitHub connect'),
  });

  const skip = (
    <Button type="button" variant="ghost" onClick={onSkip}>
      Skip
    </Button>
  );

  if (platformConfigured) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Connect the Peon GitHub App to deploy from your repositories.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
            {connectMut.isPending ? 'Redirecting…' : 'Connect GitHub'}
          </Button>
          {skip}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Add a GitHub or GitLab app under Git sources to deploy from repositories.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/sources">Open Git sources</Link>
        </Button>
        {skip}
      </div>
    </div>
  );
}

/** Step 4: create a project, then land on its services tab with the New service dialog open. */
export function ProjectStep({ workspaceId: wsId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      createProject(wsId, {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: async (project) => {
      await qc.invalidateQueries({ queryKey: ['projects', wsId] });
      await qc.invalidateQueries({ queryKey: ['billing', wsId] });
      toast.success('Project created');
      router.push(`/projects/${project.id}?tab=services&new=service`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !createMut.isPending) createMut.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="wizard-project-name">Name</Label>
        <Input id="wizard-project-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="wizard-project-description">Description (optional)</Label>
        <Input
          id="wizard-project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={!name.trim() || createMut.isPending}>
        {createMut.isPending ? 'Creating…' : 'Create project'}
      </Button>
    </form>
  );
}
