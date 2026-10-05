// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusBadge, statusTone } from '../status-badge';
import { StatCard } from '../stat-card';
import { DataTable } from '../data-table';
import { ListRow } from '../list-row';
import { KindChip, RolePill } from '../kind-chip';

describe('StatusBadge', () => {
  it('maps known statuses to tones', () => {
    expect(statusTone('RUNNING')).toBe('success');
    expect(statusTone('BUILDING')).toBe('warning');
    expect(statusTone('FAILED')).toBe('destructive');
    expect(statusTone('STOPPED')).toBe('muted');
    expect(statusTone('DISCONNECTED')).toBe('destructive');
    expect(statusTone('UNREACHABLE')).toBe('destructive');
    expect(statusTone('EXITED')).toBe('destructive');
  });
  it('renders unknown statuses as a muted sentence-case label instead of crashing', () => {
    render(<StatusBadge status="PROVISIONING_DISK" />);
    const el = screen.getByText('Provisioning disk');
    expect(el.closest('[data-tone]')?.getAttribute('data-tone')).toBe('muted');
  });
  it('does not force lowercase', () => {
    render(<StatusBadge status="Needs setup" tone="warning" />);
    expect(screen.getByText('Needs setup')).toBeInTheDocument();
  });
});

describe('StatCard', () => {
  it('renders value in tabular sans display size', () => {
    render(<StatCard label="Servers" value={3} />);
    const v = screen.getByText('3');
    expect(v.className).toContain('tabular-nums');
    expect(v.className).not.toContain('font-mono');
    expect(v.className).toContain('text-display');
  });
  it('colours the value with the destructive tone', () => {
    render(<StatCard label="Disk" value="95%" tone="destructive" />);
    expect(screen.getByText('95%').className).toContain('text-destructive');
  });
});

describe('DataTable', () => {
  const columns = [{ key: 'name', header: 'Name', cell: (r: { id: string; name: string }) => r.name }];
  it('renders rows and header', () => {
    render(<DataTable columns={columns} rows={[{ id: '1', name: 'web' }]} rowKey={(r) => r.id} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
  });
  it('renders the empty state when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyState={<p>Nothing here</p>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
  it('renders skeleton rows while loading', () => {
    const { container } = render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} isLoading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
  it('links rows when rowHref is given', () => {
    render(<DataTable columns={columns} rows={[{ id: '1', name: 'web' }]} rowKey={(r) => r.id} rowHref={(r) => `/s/${r.id}`} />);
    expect(screen.getByRole('link', { name: 'web' })).toHaveAttribute('href', '/s/1');
  });
  it('stretches the row link over the whole row and lifts other cells above it', () => {
    const twoCols = [
      ...columns,
      { key: 'actions', header: 'Actions', cell: () => <button type="button">Delete</button> },
    ];
    render(<DataTable columns={twoCols} rows={[{ id: '1', name: 'web' }]} rowKey={(r) => r.id} rowHref={(r) => `/s/${r.id}`} />);
    const link = screen.getByRole('link', { name: 'web' });
    expect(link.className.split(/\s+/)).not.toContain('relative');
    expect(link.className).toContain('after:inset-0');
    const wrapper = screen.getByRole('button', { name: 'Delete' }).parentElement!;
    expect(wrapper.className).toContain('z-10');
    // Plain cell text lets clicks fall through to the row link; controls opt back in.
    expect(wrapper.className.split(/\s+/)).toContain('pointer-events-none');
    expect(wrapper.className).toContain('[&_button]:pointer-events-auto');
  });
  it('makes onRowClick rows keyboard-activatable', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={[{ id: '1', name: 'web' }]} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    const row = screen.getByRole('button', { name: 'web' });
    expect(row).toHaveAttribute('tabIndex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'web' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
  it('ignores Enter and Space on a control inside an onRowClick row', () => {
    const onRowClick = vi.fn();
    const withAction = [
      ...columns,
      { key: 'actions', header: 'Actions', cell: () => <button type="button">Restart</button> },
    ];
    render(<DataTable columns={withAction} rows={[{ id: '1', name: 'web' }]} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    const inner = screen.getByRole('button', { name: 'Restart' });
    fireEvent.keyDown(inner, { key: 'Enter' });
    fireEvent.keyDown(inner, { key: ' ' });
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('ListRow', () => {
  it('renders as a link when href given', () => {
    render(<ListRow href="/x" title="Server one" subtitle="10.0.0.1" />);
    expect(screen.getByRole('link', { name: /Server one/ })).toHaveAttribute('href', '/x');
  });
});

describe('chips', () => {
  it('render sentence-case labels', () => {
    render(<><KindChip kind="GIT_APP" /><RolePill role="BILLING_ADMIN" /></>);
    expect(screen.getByText('Git app')).toBeInTheDocument();
    expect(screen.getByText('Billing admin')).toBeInTheDocument();
  });
});
