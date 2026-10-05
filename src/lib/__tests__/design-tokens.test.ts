import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

function hex(selector: string, name: string) {
  const m = block(selector).match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`${name} missing in ${selector}`);
  return m[1];
}

function luminance(h: string) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('design tokens', () => {
  it('uses the indigo accent in both themes', () => {
    expect(hex(':root', 'primary')).toBe('#5E6AD2');
    expect(hex('.dark', 'primary')).toBe('#7170FF');
  });

  it('has no phosphor-era tokens', () => {
    for (const t of ['--phosphor', '--phosphor-dim', '--violet', '--faint', '--border-bright']) {
      expect(css).not.toContain(t);
    }
    expect(css).not.toContain('--font-heading');
    expect(css).not.toContain('--font-display');
    expect(css).not.toContain('panel-title-slashes');
    expect(css).not.toContain('bg-grid');
  });

  it('defines exactly the seven text sizes', () => {
    expect(css).toMatch(/--text-\*:\s*initial/);
    for (const [name, px] of [
      ['xs', '11px'], ['sm', '12px'], ['base', '13px'], ['md', '14px'],
      ['lg', '16px'], ['xl', '20px'], ['display', '28px'],
    ]) {
      expect(css).toMatch(new RegExp(`--text-${name}:\\s*${px}`));
    }
  });

  it('keeps muted text readable in both themes (WCAG AA 4.5:1)', () => {
    expect(contrast(hex(':root', 'muted-foreground'), hex(':root', 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(':root', 'muted-foreground'), hex(':root', 'card'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('.dark', 'muted-foreground'), hex('.dark', 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex('.dark', 'muted-foreground'), hex('.dark', 'card'))).toBeGreaterThanOrEqual(4.5);
    for (const theme of [':root', '.dark']) {
      for (const name of ['success', 'warning', 'destructive', 'info']) {
        expect(contrast(hex(theme, name), hex(theme, 'card')), `${name} on card in ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses Geist fonts', () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-geist-sans\)/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\)/);
  });
});
