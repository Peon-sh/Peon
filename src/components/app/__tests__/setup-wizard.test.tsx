// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const data = {
  keys: [] as { id: string; name: string; publicKey: string | null }[],
  servers: [] as { id: string }[],
  sources: { github: [] as { status: string }[], gitlab: [], platformGithubConfigured: true },
  projects: [] as { id: string }[],
};
const createPrivateKey = vi.fn();
const createServer = vi.fn();
const createProject = vi.fn();

vi.mock('@/services/api/privatekey', () => ({
  listPrivateKeys: () => Promise.resolve(data.keys),
  createPrivateKey: (...a: unknown[]) => createPrivateKey(...a),
}));
vi.mock('@/services/api/server', () => ({
  listServers: () => Promise.resolve(data.servers),
  createServer: (...a: unknown[]) => createServer(...a),
}));
vi.mock('@/services/api/sources', () => ({
  listSources: () => Promise.resolve(data.sources),
  startGithubConnect: vi.fn(),
}));
vi.mock('@/services/api/project', () => ({
  listProjects: () => Promise.resolve(data.projects),
  createProject: (...a: unknown[]) => createProject(...a),
}));

import { SetupWizard } from '../setup-wizard';

function renderWizard(props: Partial<React.ComponentProps<typeof SetupWizard>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (p: Partial<React.ComponentProps<typeof SetupWizard>>) => (
    <QueryClientProvider client={qc}>
      <SetupWizard workspaceId="w1" {...p} />
    </QueryClientProvider>
  );
  const r = render(ui(props));
  return { ...r, rerenderWith: (p: Partial<React.ComponentProps<typeof SetupWizard>>) => r.rerender(ui(p)) };
}

const current = (container: HTMLElement) =>
  container.querySelector('[data-current]')?.getAttribute('data-step');

beforeEach(() => {
  localStorage.clear();
  data.keys = [];
  data.servers = [];
  data.sources = { github: [], gitlab: [], platformGithubConfigured: true };
  data.projects = [];
  vi.clearAllMocks();
});

describe('SetupWizard', () => {
  it('renders nothing when all four steps are done', async () => {
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }];
    data.sources.github = [{ status: 'CONNECTED' }];
    data.projects = [{ id: 'p1' }];
    const { container } = renderWizard();
    await act(async () => {});
    expect(container.querySelector('[data-slot="panel"]')).toBeNull();
  });

  it('starts at the SSH key step and shows later steps collapsed', async () => {
    const { container } = renderWizard();
    expect(await screen.findByText('Set up your workspace')).toBeInTheDocument();
    expect(current(container)).toBe('key');
    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Paste an existing key instead' })).toHaveAttribute('href', '/keys-and-tokens');
    expect(screen.queryByLabelText('IP / Hostname')).toBeNull();
  });

  it('shows done summaries and opens the first incomplete step', async () => {
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }, { id: 's2' }];
    const { container } = renderWizard();
    await screen.findByText('Set up your workspace');
    expect(screen.getByText('1 key')).toBeInTheDocument();
    expect(screen.getByText('2 servers')).toBeInTheDocument();
    expect(current(container)).toBe('github');
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument();
  });

  it('generates a key, shows the public key, then continues to the server step with it preselected', async () => {
    createPrivateKey.mockImplementation(async () => {
      data.keys = [{ id: 'k9', name: 'default', publicKey: 'ssh-ed25519 AAAA test' }];
      return { id: 'k9', name: 'default', publicKey: 'ssh-ed25519 AAAA test' };
    });
    const { container } = renderWizard();
    fireEvent.click(await screen.findByRole('button', { name: 'Generate key' }));
    expect(await screen.findByText('ssh-ed25519 AAAA test')).toBeInTheDocument();
    expect(createPrivateKey).toHaveBeenCalledWith('w1', { name: 'default', generate: true });
    expect(current(container)).toBe('key');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(current(container)).toBe('server');
    expect(screen.getByLabelText('IP / Hostname')).toBeInTheDocument();
  });

  it('lets the user revisit a completed step and skip GitHub', async () => {
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }];
    const { container } = renderWizard();
    await screen.findByText('Set up your workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(current(container)).toBe('project');
    fireEvent.click(screen.getByRole('button', { name: /Add an SSH key/ }));
    expect(current(container)).toBe('key');
  });

  it('persists a GitHub skip and moves to the project step when it is missing', async () => {
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }];
    const { container } = renderWizard();
    await screen.findByText('Set up your workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(localStorage.getItem('peon.setupWizard.w1.githubSkipped')).toBe('1');
    expect(current(container)).toBe('project');

    // Collapsed summary reads "Skipped" with the number marker, not the check.
    const github = container.querySelector('[data-step="github"]')!;
    expect(github).toHaveTextContent('Skipped');
    expect(github.querySelector('[aria-label="Done"]')).toBeNull();
    expect(github).toHaveTextContent('3');

    // It can be reopened to connect later.
    fireEvent.click(screen.getByRole('button', { name: /Connect GitHub.*Skipped/ }));
    expect(current(container)).toBe('github');
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeInTheDocument();
  });

  it('hides once GitHub is skipped and everything else is done', async () => {
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }];
    data.projects = [{ id: 'p1' }];
    const { container } = renderWizard();
    await screen.findByText('Set up your workspace');
    expect(current(container)).toBe('github');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(container.querySelector('[data-slot="panel"]')).toBeNull();
    expect(localStorage.getItem('peon.setupWizard.w1.githubSkipped')).toBe('1');
  });

  it('stays hidden on mount when GitHub was skipped and the rest is done', async () => {
    localStorage.setItem('peon.setupWizard.w1.githubSkipped', '1');
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }];
    data.projects = [{ id: 'p1' }];
    const { container } = renderWizard();
    await act(async () => {});
    expect(container.querySelector('[data-slot="panel"]')).toBeNull();
  });

  it('creates a project and routes to its services tab with the new service dialog', async () => {
    data.keys = [{ id: 'k1', name: 'k', publicKey: null }];
    data.servers = [{ id: 's1' }];
    data.sources.github = [{ status: 'CONNECTED' }];
    createProject.mockResolvedValue({ id: 'p7' });
    renderWizard();
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Web' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p7?tab=services&new=service'));
    expect(createProject).toHaveBeenCalledWith('w1', { name: 'Web' });
  });

  it('opens the server step and scrolls into view on forceStep', async () => {
    const onHandled = vi.fn();
    const { container, rerenderWith } = renderWizard({ onForceStepHandled: onHandled });
    await screen.findByText('Set up your workspace');
    rerenderWith({ forceStep: 'server', onForceStepHandled: onHandled });
    await waitFor(() => expect(current(container)).toBe('server'));
    expect(onHandled).toHaveBeenCalled();
  });
});
