// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from '../page-header';
import { Panel } from '../panel';
import { FormField, FormSection } from '../form-section';
import { KeyValueList } from '../key-value-list';

describe('PageHeader', () => {
  it('renders title as h1 at xl size and optional description and actions', () => {
    render(<PageHeader title="Servers" description="Deploy targets" actions={<button>Add</button>} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Servers' });
    expect(h1.className).toContain('text-xl');
    expect(screen.getByText('Deploy targets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('renders header only when title or actions given', () => {
    const { container } = render(<Panel>body</Panel>);
    expect(container.querySelector('[data-slot="panel-header"]')).toBeNull();
  });
  it('renders title without slashes prefix and a footer band', () => {
    render(<Panel title="Build" footer={<button>Save</button>}>body</Panel>);
    expect(screen.getByText('Build').textContent).toBe('Build');
    expect(screen.getByRole('button', { name: 'Save' }).closest('[data-slot="panel-footer"]')).not.toBeNull();
  });
});

describe('FormSection', () => {
  it('renders a form when onSubmit is given and calls it', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <FormSection title="General" onSubmit={onSubmit} footer={<button type="submit">Save</button>}>
        <FormField label="Name" htmlFor="name"><input id="name" /></FormField>
      </FormSection>,
    );
    screen.getByRole('button', { name: 'Save' }).click();
    expect(onSubmit).toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
  it('uses a two-column grid only from the lg breakpoint', () => {
    const { container } = render(<FormSection title="x"><FormField label="a"><input /></FormField></FormSection>);
    const field = container.querySelector('[data-slot="form-field"]')!;
    expect(field.className).toContain('lg:grid-cols-[220px_1fr]');
    expect(field.className).not.toMatch(/(^|\s)(sm|md):grid-cols/);
  });
});

describe('KeyValueList', () => {
  it('renders each pair and mono values in font-mono', () => {
    render(<KeyValueList items={[{ label: 'IP', value: '10.0.0.1', mono: true }, { label: 'Name', value: 'web' }]} />);
    expect(screen.getByText('10.0.0.1').className).toContain('font-mono');
    expect(screen.getByText('Name')).toBeInTheDocument();
  });
});
