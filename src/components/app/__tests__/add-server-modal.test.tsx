// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const createServer = vi.fn();
vi.mock('@/services/api/server', () => ({ createServer: (...a: unknown[]) => createServer(...a) }));
vi.mock('@/services/api/privatekey', () => ({
  listPrivateKeys: () => Promise.resolve([]),
  createPrivateKey: vi.fn(),
}));

import { toast } from 'sonner';
import { AddServerModal } from '../add-server-modal';
import { AddServerForm } from '../add-server-form';

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
);

beforeEach(() => vi.clearAllMocks());

describe('AddServerModal', () => {
  it('renders the form in the dialog; Cancel closes it', async () => {
    const onOpenChange = vi.fn();
    render(wrap(<AddServerModal workspaceId="w1" open onOpenChange={onOpenChange} />));
    expect(screen.getByRole('heading', { name: 'Add server' })).toBeInTheDocument();
    expect(await screen.findByText(/No SSH keys in this workspace yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add server' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('AddServerForm', () => {
  it('creates a server with the preselected key, then calls onCreated and toasts', async () => {
    createServer.mockResolvedValue({ id: 's1' });
    const onCreated = vi.fn();
    render(wrap(<AddServerForm workspaceId="w1" defaultPrivateKeyId="k1" onCreated={onCreated} />));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'web-1' } });
    fireEvent.change(screen.getByLabelText('IP / Hostname'), { target: { value: '203.0.113.10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 's1' }));
    expect(createServer).toHaveBeenCalledWith('w1', {
      name: 'web-1',
      ip: '203.0.113.10',
      port: 22,
      user: 'root',
      privateKeyId: 'k1',
      proxyType: 'TRAEFIK',
    });
    expect(toast.success).toHaveBeenCalledWith('Server added — checking connection…');
  });
});
