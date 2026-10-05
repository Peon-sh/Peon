# Linear-direction UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Peon's UI on a Vercel/Linear-style foundation (neutral surfaces, indigo accent, Geist, fixed type scale, shared app parts) across every component and page, with no behavior change.

**Architecture:** Tokens and fonts change first in `globals.css` and the root layout. The shadcn primitives in `src/components/ui/` are restyled in place. A new opinionated app layer in `src/components/app/` (PageHeader, Panel, FormSection, KeyValueList, DataTable, ListRow, StatCard, StatusBadge, EmptyState, Callout) replaces the ad-hoc parts, and every page is migrated onto it module by module. A custom ESLint rule blocks arbitrary pixel font sizes and raw palette colors so the scale cannot erode; it runs as `warn` during migration and flips to `error` at the end.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (CSS-first theme), shadcn v4 primitives on radix-ui, class-variance-authority, lucide-react, next/font (Geist), vitest 5 with jsdom and @testing-library/react for component tests, ESLint 10 flat config.

**Spec:** `docs/superpowers/specs/2026-09-29-linear-redesign-design.md`

## Global Constraints

- Accent: indigo `#5E6AD2` light, `#7170FF` dark. No other accent anywhere.
- Fonts: Geist Sans as `--font-sans`, Geist Mono as `--font-mono`. Archivo, Inter, IBM Plex Mono removed. `--font-heading` and `--font-display` removed.
- Type scale only: `text-xs` 11px, `text-sm` 12px, `text-base` 13px, `text-md` 14px, `text-lg` 16px, `text-xl` 20px, `text-display` 28px. No `text-[Npx]` anywhere under `src/`.
- Weights: 400, 500, 600 only (`font-normal`, `font-medium`, `font-semibold`). No `font-bold`, `font-extrabold`, `font-black`.
- No raw Tailwind palette classes (`bg-amber-500`, `text-zinc-500`, etc.) under `src/`. Hex values appear only in `globals.css` and `logo.tsx`.
- Deleted tokens, must have zero usages at the end: `phosphor`, `phosphor-dim`, `violet`, `faint`, `border-bright`, `font-heading`, `font-display`, `panel-title-slashes`, `bg-grid`.
- Copy: sentence case for all UI text. Title Case only for sidebar nav item labels. No `//` prefixes. No lowercase-forced status text.
- Controls: 32px default (`h-8`), 28px small (`h-7`), 36px large (`h-9`). Radius 6px controls (`rounded-md`), 8px panels (`rounded-lg`), 10px dialogs (`rounded-xl`).
- Spacing: 4px grid, page padding 24px (`p-6`), panel padding 16px (`p-4`), control gap 8px (`gap-2`).
- Both themes supported, dark default. No shadows in dark mode.
- Behavior, data fetching, routing, and API calls do not change. Tests that assert on copy are updated in the same commit as the copy change.
- Branch `redesign/linear-foundation` off `staging`. Rebase onto `staging` weekly. Commit after every task.
- Verification per page: both themes, 1280px and 1024px widths, default, empty, loading, error states.

## Review Focus

1. Light theme muted text on gray-50 background: `--muted-foreground` must stay at or above 4.5:1 contrast, or helper text becomes unreadable. Pinned in Task 2 by a contrast assertion.
2. Sidebar collapsed to icon mode (`Cmd+B`): the new active pill and section labels must not overflow the 48px rail. Pinned in Task 7 by a jsdom test on the collapsed class set.
3. Status strings not in the tone map (for example a new `PROVISIONING` state): `StatusBadge` must render a muted badge, not crash or render empty. Pinned in Task 6.
4. Theme toggle while an SSH terminal is open: xterm must repaint with the new theme, not keep the old background. Pinned in Task 13 by a unit test on `xtermTheme()` plus an effect that calls `term.options.theme` on theme change.
5. `FormSection` at 1024px: two-column field layout must collapse to one column, or inputs clip. Pinned in Task 5 by asserting the grid class uses the `lg:` breakpoint only.

---

### Task 1: Branch and component test infrastructure

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vitest.config.ts`
- Create: `src/test/setup-dom.ts`
- Create: `src/components/app/__tests__/smoke.test.tsx`

**Interfaces:**
- Produces: jsdom-capable vitest runs for any test file starting with the docblock `// @vitest-environment jsdom`; `@testing-library/react` `render` and `screen`; `@testing-library/jest-dom` matchers.

- [ ] **Step 1: Create the branch**

```bash
git checkout staging && git pull && git checkout -b redesign/linear-foundation
```

- [ ] **Step 2: Install test dependencies**

```bash
pnpm add -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Add the DOM setup file**

Create `src/test/setup-dom.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Wire setup into vitest**

Edit `vitest.config.ts` so the `test` block reads:

```ts
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup-dom.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'src/test/integration/**',
      '**/*.integration.test.ts',
    ],
  },
```

- [ ] **Step 5: Write a smoke test that fails without jsdom**

Create `src/components/app/__tests__/smoke.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('dom test infra', () => {
  it('renders into jsdom', () => {
    render(<span>hello</span>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it**

Run: `pnpm vitest run src/components/app/__tests__/smoke.test.tsx`
Expected: PASS (1 test). If it fails with "document is not defined", the docblock is missing.

- [ ] **Step 7: Run the whole unit suite to confirm nothing broke**

Run: `pnpm test`
Expected: all existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup-dom.ts src/components/app/__tests__/smoke.test.tsx
git commit -m "test: add jsdom and testing-library for component tests"
```

---

### Task 2: Foundation tokens, type scale, and fonts

**Files:**
- Modify: `src/app/globals.css` (full rewrite of the `@theme inline`, `:root`, `.dark`, and `@layer base` blocks; delete `panel-title-slashes` and `bg-grid` utilities)
- Modify: `src/app/layout.tsx` (fonts)
- Create: `src/lib/__tests__/design-tokens.test.ts`

**Interfaces:**
- Produces: CSS custom properties `--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --success --warning --info --border --input --ring --chart-1..5 --sidebar --sidebar-foreground --sidebar-primary --sidebar-primary-foreground --sidebar-accent --sidebar-accent-foreground --sidebar-border --sidebar-ring --shadow-popover`; Tailwind utilities `text-xs|sm|base|md|lg|xl|display`, `font-sans`, `font-mono`, `bg-success/…`, `text-info`, etc.
- Produces: `src/lib/__tests__/design-tokens.test.ts` guards this contract.

- [ ] **Step 1: Write the failing token contract test**

Create `src/lib/__tests__/design-tokens.test.ts`:

```ts
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
  });

  it('uses Geist fonts', () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-geist-sans\)/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\)/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/__tests__/design-tokens.test.ts`
Expected: FAIL on the accent assertion (current primary is `#0C9268`).

- [ ] **Step 3: Rewrite `globals.css`**

Replace the entire file with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);

    /* Fixed type scale. Nothing outside this list may be used. */
    --text-*: initial;
    --text-xs: 11px;
    --text-xs--line-height: 16px;
    --text-sm: 12px;
    --text-sm--line-height: 16px;
    --text-base: 13px;
    --text-base--line-height: 20px;
    --text-md: 14px;
    --text-md--line-height: 20px;
    --text-lg: 16px;
    --text-lg--line-height: 24px;
    --text-xl: 20px;
    --text-xl--line-height: 28px;
    --text-display: 28px;
    --text-display--line-height: 32px;

    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar: var(--sidebar);
    --color-chart-5: var(--chart-5);
    --color-chart-4: var(--chart-4);
    --color-chart-3: var(--chart-3);
    --color-chart-2: var(--chart-2);
    --color-chart-1: var(--chart-1);
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-success: var(--success);
    --color-warning: var(--warning);
    --color-info: var(--info);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);

    --shadow-popover: var(--shadow-popover);

    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    --radius-xl: 10px;
    --radius-2xl: 12px;
}

/* Light theme: white panels on a gray-50 page. */
:root {
    --background: #FAFAFA;
    --foreground: #171717;
    --card: #FFFFFF;
    --card-foreground: #171717;
    --popover: #FFFFFF;
    --popover-foreground: #171717;
    --primary: #5E6AD2;
    --primary-foreground: #FFFFFF;
    --secondary: #F4F4F5;
    --secondary-foreground: #171717;
    --muted: #F4F4F5;
    --muted-foreground: #6B6B6B;
    --accent: #EBEBEB;
    --accent-foreground: #171717;
    --destructive: #DC2626;
    --success: #16A34A;
    --warning: #D97706;
    --info: #2563EB;
    --border: #E5E5E5;
    --input: #E5E5E5;
    --ring: #5E6AD2;
    --chart-1: #5E6AD2;
    --chart-2: #2563EB;
    --chart-3: #D97706;
    --chart-4: #16A34A;
    --chart-5: #6B6B6B;
    --shadow-popover: 0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
    --radius: 8px;
    --sidebar: #FAFAFA;
    --sidebar-foreground: #171717;
    --sidebar-primary: #5E6AD2;
    --sidebar-primary-foreground: #FFFFFF;
    --sidebar-accent: #EBEBEB;
    --sidebar-accent-foreground: #171717;
    --sidebar-border: #E5E5E5;
    --sidebar-ring: #5E6AD2;
}

/* Dark theme, the default. Near-black neutrals, no green cast. */
.dark {
    --background: #0A0A0A;
    --foreground: #EDEDED;
    --card: #111111;
    --card-foreground: #EDEDED;
    --popover: #161616;
    --popover-foreground: #EDEDED;
    --primary: #7170FF;
    --primary-foreground: #FFFFFF;
    --secondary: #1A1A1A;
    --secondary-foreground: #EDEDED;
    --muted: #1A1A1A;
    --muted-foreground: #A1A1A1;
    --accent: #222222;
    --accent-foreground: #EDEDED;
    --destructive: #F0575B;
    --success: #4ADE80;
    --warning: #FBBF24;
    --info: #60A5FA;
    --border: #1F1F1F;
    --input: #262626;
    --ring: #7170FF;
    --chart-1: #7170FF;
    --chart-2: #60A5FA;
    --chart-3: #FBBF24;
    --chart-4: #4ADE80;
    --chart-5: #A1A1A1;
    --shadow-popover: none;
    --sidebar: #0A0A0A;
    --sidebar-foreground: #EDEDED;
    --sidebar-primary: #7170FF;
    --sidebar-primary-foreground: #FFFFFF;
    --sidebar-accent: #1A1A1A;
    --sidebar-accent-foreground: #EDEDED;
    --sidebar-border: #1F1F1F;
    --sidebar-ring: #7170FF;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overscroll-behavior: none;
    background-color: var(--background);
  }
  body {
    @apply bg-background text-foreground text-base;
    overscroll-behavior: none;
    background-color: var(--background);
  }
  h1, h2, h3, h4 {
    @apply font-semibold tracking-tight;
    text-wrap: balance;
  }
  ::selection {
    background: color-mix(in oklab, var(--primary) 35%, transparent);
    color: inherit;
  }
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  *::-webkit-scrollbar-thumb {
    background-color: var(--border);
    border-radius: 9999px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: var(--muted-foreground);
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
  }
  [data-slot="sidebar-wrapper"],
  [data-slot="sidebar-content"],
  [data-slot="sidebar-inset"] {
    overscroll-behavior: none;
  }
}

/* Pulse used by live status dots. */
@keyframes status-pulse {
  50% { opacity: 0.45; }
}
@utility animate-status-pulse {
  animation: status-pulse 2s infinite;
}
@utility animate-status-pulse-fast {
  animation: status-pulse 1s infinite;
}
```

- [ ] **Step 4: Swap fonts in the root layout**

In `src/app/layout.tsx` replace the three font imports and constants with:

```tsx
import { Geist, Geist_Mono } from "next/font/google"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})
```

and change the `<html>` className to:

```tsx
className={cn("antialiased", geistSans.variable, geistMono.variable)}
```

- [ ] **Step 5: Run the token test**

Run: `pnpm vitest run src/lib/__tests__/design-tokens.test.ts`
Expected: PASS (5 tests). If the contrast test fails, darken `--muted-foreground` in the failing theme by one step and re-run.

- [ ] **Step 6: Typecheck and confirm the app still builds its CSS**

Run: `pnpm typecheck && pnpm exec next build --no-lint 2>&1 | tail -20`
Expected: typecheck clean. Build succeeds. The app will look broken (old classes reference deleted tokens); that is expected until Tasks 4 to 13 complete.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/lib/__tests__/design-tokens.test.ts
git commit -m "feat(design): neutral tokens, indigo accent, Geist fonts, fixed type scale"
```

---

### Task 3: ESLint rule that blocks arbitrary sizes and raw palette colors

**Files:**
- Create: `eslint-rules/design-tokens.mjs`
- Create: `eslint-rules/__tests__/design-tokens.test.mjs`
- Modify: `eslint.config.mjs`
- Modify: `vitest.config.ts` (include `eslint-rules/**/*.test.mjs`)

**Interfaces:**
- Produces: ESLint rule `design-tokens/no-off-scale-classes`, reporting on string literals and template literals inside JSX `className` and inside `cn(...)`/`cva(...)` calls that contain `text-[…px]`, `font-bold|extrabold|black`, or `(bg|text|border|ring|fill|stroke|from|to|via)-(palette)-(digits)`.

- [ ] **Step 1: Write the failing rule tests**

Create `eslint-rules/__tests__/design-tokens.test.mjs`:

```js
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, it } from 'vitest';
import rule from '../design-tokens.mjs';

const tester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe('no-off-scale-classes', () => {
  it('accepts scale classes and rejects off-scale ones', () => {
    tester.run('no-off-scale-classes', rule, {
      valid: [
        { code: '<div className="text-sm font-medium bg-muted text-success" />' },
        { code: 'cn("text-base", active && "text-primary")' },
        { code: '<div className="text-[var(--x)]" />' },
      ],
      invalid: [
        { code: '<div className="text-[11px]" />', errors: [{ messageId: 'offScale' }] },
        { code: '<div className="font-bold" />', errors: [{ messageId: 'offScale' }] },
        { code: '<div className="bg-amber-500" />', errors: [{ messageId: 'offScale' }] },
        { code: 'cn("border-zinc-700")', errors: [{ messageId: 'offScale' }] },
        { code: 'cva("text-[12.5px]", {})', errors: [{ messageId: 'offScale' }] },
        { code: '<div className={`x ${y} text-emerald-500`} />', errors: [{ messageId: 'offScale' }] },
      ],
    });
  });
});
```

- [ ] **Step 2: Add the test glob to vitest**

In `vitest.config.ts` add inside `test`:

```ts
    include: ['src/**/*.test.{ts,tsx}', 'eslint-rules/**/*.test.mjs'],
```

- [ ] **Step 3: Run to see it fail**

Run: `pnpm vitest run eslint-rules`
Expected: FAIL, cannot resolve `../design-tokens.mjs`.

- [ ] **Step 4: Implement the rule**

Create `eslint-rules/design-tokens.mjs`:

```js
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const OFF_SCALE = new RegExp(
  [
    'text-\\[[0-9.]+px\\]',
    '\\bfont-(bold|extrabold|black)\\b',
    `\\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(${PALETTE})-\\d{2,3}\\b`,
  ].join('|'),
);

const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow font sizes, weights, and colors outside the design scale.' },
    messages: {
      offScale: 'Off-scale class "{{cls}}". Use the type scale (text-xs..text-display), weights 400/500/600, and semantic color tokens.',
    },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      const m = text.match(OFF_SCALE);
      if (m) context.report({ node, messageId: 'offScale', data: { cls: m[0] } });
    }
    function checkExpression(node) {
      if (!node) return;
      if (node.type === 'Literal' && typeof node.value === 'string') check(node, node.value);
      else if (node.type === 'TemplateLiteral') node.quasis.forEach((q) => check(q, q.value.raw));
      else if (node.type === 'ConditionalExpression') {
        checkExpression(node.consequent);
        checkExpression(node.alternate);
      } else if (node.type === 'LogicalExpression') {
        checkExpression(node.left);
        checkExpression(node.right);
      } else if (node.type === 'ArrayExpression') node.elements.forEach(checkExpression);
      else if (node.type === 'ObjectExpression') {
        node.properties.forEach((p) => {
          if (p.type === 'Property') {
            if (p.key.type === 'Literal') checkExpression(p.key);
            checkExpression(p.value);
          }
        });
      }
    }
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className' || !node.value) return;
        if (node.value.type === 'Literal') checkExpression(node.value);
        else if (node.value.type === 'JSXExpressionContainer') checkExpression(node.value.expression);
      },
      CallExpression(node) {
        const callee = node.callee;
        const name = callee.type === 'Identifier' ? callee.name : null;
        if (name === 'cn' || name === 'cva' || name === 'clsx') node.arguments.forEach(checkExpression);
      },
    };
  },
};

export default rule;
```

- [ ] **Step 5: Run the rule tests**

Run: `pnpm vitest run eslint-rules`
Expected: PASS.

- [ ] **Step 6: Register the rule as a warning for now**

In `eslint.config.mjs`, add the import at the top:

```js
import designTokens from "./eslint-rules/design-tokens.mjs";
```

and add this entry to the `defineConfig([...])` array before `globalIgnores`:

```js
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "design-tokens": { rules: { "no-off-scale-classes": designTokens } } },
    rules: { "design-tokens/no-off-scale-classes": "warn" },
  },
```

Also remove `"src/components/ui/**"` from `globalIgnores` so primitives are linted too.

- [ ] **Step 7: Confirm lint runs and counts warnings**

Run: `pnpm lint 2>&1 | tail -5`
Expected: exits 0 with several hundred warnings and zero errors. Note the warning count; it must reach zero by Task 14. If `src/components/ui/**` now produces unrelated errors, add `{ files: ["src/components/ui/**"], rules: { "react-hooks/…": "off" } }` overrides for exactly the rules reported, nothing broader.

- [ ] **Step 8: Commit**

```bash
git add eslint-rules eslint.config.mjs vitest.config.ts
git commit -m "chore(lint): add design-tokens rule blocking off-scale classes (warn)"
```

---

### Task 4: Restyle the shadcn primitives in place

**Files:**
- Modify: every file in `src/components/ui/` (28 files)

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces: unchanged component APIs; new sizes. `Button` sizes `default`=h-8, `sm`=h-7, `lg`=h-9, `xs` removed (map to `sm`), `icon`=size-8, `icon-sm`=size-7, `icon-lg`=size-9, `icon-xs` removed (map to `icon-sm`). `Input`, `Textarea`, `Select` trigger = h-8 / min-h-20, text-base.

- [ ] **Step 1: Button**

Replace `buttonVariants` in `src/components/ui/button.tsx` with:

```tsx
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-base font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border-border bg-card text-foreground hover:bg-secondary aria-expanded:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost: "text-foreground hover:bg-secondary aria-expanded:bg-secondary",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-2 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 gap-1.5 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-2 px-4 text-md",
        icon: "size-8",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

Then run `grep -rn 'size="xs"\|size="icon-xs"' src` and change every `size="xs"` to `size="sm"` and every `size="icon-xs"` to `size="icon-sm"`.

- [ ] **Step 2: Input and Textarea**

`src/components/ui/input.tsx` className:

```tsx
"h-8 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium"
```

`src/components/ui/textarea.tsx` className: same as Input but `min-h-20 py-2 h-auto` instead of `h-8`, and no `file:` classes.

- [ ] **Step 3: Remaining primitives, mechanical edits**

Apply these replacements in every other file under `src/components/ui/` (use `grep -n` per file to find them, edit by hand):

| Find | Replace with |
|---|---|
| `text-xs/relaxed` | `text-base` |
| `text-sm` when on a title (dialog/sheet/alert-dialog/card title) | `text-md font-semibold` |
| `text-xs` on descriptions and helper lines | `text-sm text-muted-foreground` |
| `font-heading` | remove |
| `font-bold` | `font-semibold` |
| `ring-1 ring-foreground/10` (card.tsx) | `border border-border` |
| `rounded-lg` on `DialogContent`, `AlertDialogContent`, `SheetContent` | `rounded-xl` |
| `shadow-*` classes | `shadow-popover dark:shadow-none` on dialog, popover, dropdown-menu, command, select content, tooltip; remove elsewhere |
| `h-7` / `h-6` on triggers (select, searchable-select, input-group) | `h-8` |
| `size-7` on checkbox/switch thumb areas | keep |
| `text-[10px]`, `text-[11px]` | `text-xs` |
| `text-[12px]`, `text-[12.5px]`, `text-[13px]` | `text-base` |
| any `-emerald-`, `-zinc-`, `-amber-`, `-red-`, `-neutral-` class | semantic token equivalent (`success`, `muted-foreground`, `warning`, `destructive`, `foreground`) |

Specific files:

- `badge.tsx`: variants become `default: bg-primary/10 text-primary`, `secondary: bg-secondary text-secondary-foreground`, `outline: border-border text-foreground`, `destructive: bg-destructive/10 text-destructive`, base `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium`.
- `tabs.tsx`: `TabsList` = `inline-flex h-8 items-center gap-1 rounded-md bg-secondary p-0.5`; `TabsTrigger` = `h-7 rounded-sm px-3 text-base font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none`.
- `table.tsx`: `TableHead` = `h-9 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground`; `TableCell` = `px-3 py-2.5 text-base`; `TableRow` = `border-b border-border hover:bg-secondary/60 data-[state=selected]:bg-secondary`.
- `sidebar.tsx`: set `SIDEBAR_WIDTH = "15rem"` (240px). `SidebarMenuButton` base class: `text-base font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground data-[active=true]:font-medium [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-primary`. `SidebarGroupLabel`: `px-2 text-xs font-medium text-muted-foreground` with no uppercase and no tracking.
- `sonner.tsx`: keep `richColors` off; pass `toastOptions={{ classNames: { toast: 'bg-popover text-popover-foreground border-border shadow-popover dark:shadow-none text-base' } }}`.
- `skeleton.tsx`: `animate-pulse rounded-md bg-secondary`.
- `separator.tsx`, `label.tsx` (`text-sm font-medium text-foreground`), `avatar.tsx` (fallback `bg-secondary text-sm font-medium`), `tooltip.tsx` (`bg-foreground text-background text-xs rounded-md px-2 py-1`), `scroll-area.tsx`, `collapsible.tsx`, `switch.tsx` (checked `bg-primary`), `checkbox.tsx` (checked `bg-primary border-primary`), `alert.tsx` (variants `default: bg-card border-border`, `destructive: bg-destructive/5 border-destructive/30 text-destructive`; add `warning: bg-warning/5 border-warning/30 text-warning`, `info: bg-info/5 border-info/30 text-info`), `command.tsx` (input h-9 text-base, item `text-base rounded-sm px-2 py-1.5 data-[selected=true]:bg-secondary`), `dropdown-menu.tsx` and `select.tsx` and `popover.tsx` (content `rounded-lg border border-border bg-popover p-1 shadow-popover dark:shadow-none`, items `text-base rounded-sm px-2 py-1.5`), `dialog.tsx` / `alert-dialog.tsx` (overlay `bg-black/50`, content `rounded-xl border border-border bg-card p-6 gap-4`), `sheet.tsx` (content `bg-card border-border`), `input-group.tsx`, `searchable-select.tsx`, `card.tsx` (`rounded-lg border border-border bg-card`, `[--card-spacing:--spacing(4)]`, title `text-md font-semibold`, description `text-sm text-muted-foreground`).

- [ ] **Step 4: Verify no off-scale warnings remain in `ui/`**

Run: `pnpm exec eslint src/components/ui --rule 'design-tokens/no-off-scale-classes: error' 2>&1 | tail -3`
Expected: no `design-tokens` errors. Fix any reported line.

- [ ] **Step 5: Typecheck and run tests**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck reports errors only at call sites that used `size="xs"` or `size="icon-xs"` (fixed in Step 1) and nothing else. Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui src
git commit -m "feat(ui): restyle shadcn primitives to the new scale and tokens"
```

---

### Task 5: Page layout parts: PageHeader, Panel, FormSection, KeyValueList

**Files:**
- Delete: `src/components/app/page.tsx` (after migration in Task 8+; until then keep it exporting the new parts for compatibility)
- Create: `src/components/app/page-header.tsx`
- Create: `src/components/app/panel.tsx`
- Create: `src/components/app/form-section.tsx`
- Create: `src/components/app/key-value-list.tsx`
- Modify: `src/components/app/page.tsx` to re-export from the new files and keep `PageContainer`
- Test: `src/components/app/__tests__/layout-parts.test.tsx`

**Interfaces:**
- Produces:
  - `PageContainer({ className?, children })` unchanged: `min-w-0 w-full space-y-6`.
  - `PageHeader({ title: ReactNode; description?: ReactNode; actions?: ReactNode; className? })`.
  - `Panel({ id?, title?: ReactNode; description?: ReactNode; actions?: ReactNode; footer?: ReactNode; padded?: boolean (default true); children; className?; contentClassName? })`.
  - `FormSection({ title: ReactNode; description?: ReactNode; children; onSubmit?: (e) => void; footer?: ReactNode; className? })` renders a `<form>` when `onSubmit` given, else a `<section>`. Children are laid out in `grid gap-4 lg:grid-cols-[220px_1fr]` per `FormField`.
  - `FormField({ label: ReactNode; htmlFor?: string; description?: ReactNode; children })` renders label column + control column.
  - `KeyValueList({ items: Array<{ label: ReactNode; value: ReactNode; mono?: boolean }>; className? })`.
  - Legacy `Section` is removed. Callers migrate to `Panel` (Tasks 8 to 13).

- [ ] **Step 1: Write the failing tests**

Create `src/components/app/__tests__/layout-parts.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/components/app/__tests__/layout-parts.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `page-header.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement `panel.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  id,
  title,
  description,
  actions,
  footer,
  padded = true,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const hasHeader = !!title || !!actions;
  return (
    <section
      id={id}
      data-slot="panel"
      className={cn('bg-card border-border flex min-w-0 flex-col overflow-hidden rounded-lg border', className)}
    >
      {hasHeader ? (
        <div data-slot="panel-header" className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-md truncate font-medium">{title}</h2> : null}
            {description ? <p className="text-muted-foreground mt-0.5 text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('min-h-0 min-w-0 flex-1', padded && 'p-4', contentClassName)}>{children}</div>
      {footer ? (
        <div data-slot="panel-footer" className="bg-secondary/50 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Implement `form-section.tsx`**

```tsx
'use client';

import * as React from 'react';
import { Panel } from './panel';
import { cn } from '@/lib/utils';

export function FormSection({
  title,
  description,
  onSubmit,
  footer,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const body = (
    <Panel title={title} description={description} footer={footer} className={className} contentClassName="space-y-6">
      {children}
    </Panel>
  );
  return onSubmit ? <form onSubmit={onSubmit}>{body}</form> : body;
}

export function FormField({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="form-field" className={cn('grid gap-2 lg:grid-cols-[220px_1fr] lg:gap-6', className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `key-value-list.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export function KeyValueList({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode; mono?: boolean }>;
  className?: string;
}) {
  return (
    <dl className={cn('divide-border divide-y', className)}>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[160px_1fr] gap-4 py-2.5 text-base">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={cn('min-w-0 break-words', item.mono && 'font-mono')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 7: Make `page.tsx` a compatibility barrel**

Replace `src/components/app/page.tsx` with:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export { PageHeader } from './page-header';
export { Panel } from './panel';
export { FormField, FormSection } from './form-section';
export { KeyValueList } from './key-value-list';

/** Full-width page wrapper with consistent vertical rhythm. */
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('min-w-0 w-full space-y-6', className)}>{children}</div>;
}

/** @deprecated Migrate to Panel. Removed in Task 14. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div>
            {title ? <h2 className="text-md font-medium">{title}</h2> : null}
            {description ? <p className="text-muted-foreground mt-0.5 text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm vitest run src/components/app && pnpm typecheck`
Expected: PASS. Typecheck errors appear where callers pass `title`/`description` to the old `PageHeader` signature; those are fine and get fixed per page later, but if any call passes props the new `Panel` lacks, fix the call now.

- [ ] **Step 9: Commit**

```bash
git add src/components/app
git commit -m "feat(app): PageHeader, Panel, FormSection, KeyValueList layout parts"
```

---

### Task 6: Data and status parts: StatusBadge, StatCard, EmptyState, Callout, KindChip, DataTable, ListRow

**Files:**
- Modify: `src/components/app/status-badge.tsx`
- Modify: `src/components/app/stat-card.tsx`
- Modify: `src/components/app/empty-state.tsx`
- Create: `src/components/app/callout.tsx`; delete `src/components/app/doc-callout.tsx` after updating its four importers (`keys-and-tokens`, `servers/[serverId]`, `sources/[sourceId]`, `services/[serviceId]` pages) to import `Callout`, `CalloutSteps`, `CalloutBullets` from `./callout` with the same props.
- Modify: `src/components/app/kind-chip.tsx`
- Create: `src/components/app/data-table.tsx`
- Create: `src/components/app/list-row.tsx`
- Test: `src/components/app/__tests__/data-parts.test.tsx`

**Interfaces:**
- Produces:
  - `StatusBadge({ status: string; tone?: Tone; className? })` and `statusTone(status): Tone`. Tone = `'success' | 'warning' | 'destructive' | 'info' | 'muted'`. Label is sentence case (`Needs setup`), never lowercased.
  - `StatCard({ label; value; hint?; icon?; href?; className? })` (`accent` prop removed).
  - `EmptyState({ icon?; title; description?; action?; className? })`.
  - `Callout({ title; tone?: 'info'|'warning'|'danger' (default 'info'); children; defaultOpen?; open?; onOpenChange?; className? })`, `CalloutSteps`, `CalloutBullets`. Same behavior as `DocCallout`.
  - `KindChip({ kind; className? })`, `RolePill({ role; className? })` with sentence-case labels.
  - `DataTable<T>({ columns: Array<{ key: string; header: ReactNode; cell: (row: T) => ReactNode; className?; align?: 'left'|'right' }>; rows: T[]; rowKey: (row: T) => string; rowHref?: (row: T) => string; onRowClick?: (row: T) => void; isLoading?: boolean; emptyState?: ReactNode; className? })`.
  - `ListRow({ href?; onClick?; leading?; title; subtitle?; meta?; trailing?; className? })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/app/__tests__/data-parts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('renders value in mono display size', () => {
    render(<StatCard label="Servers" value={3} />);
    const v = screen.getByText('3');
    expect(v.className).toContain('font-mono');
    expect(v.className).toContain('text-display');
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
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/components/app/__tests__/data-parts.test.tsx`
Expected: FAIL (missing modules, lowercase labels).

- [ ] **Step 3: Rewrite `status-badge.tsx`**

```tsx
import { cn } from '@/lib/utils';

export type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'muted';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
  muted: 'bg-secondary text-muted-foreground',
};

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success animate-status-pulse',
  warning: 'bg-warning animate-status-pulse-fast',
  destructive: 'bg-destructive',
  info: 'bg-info',
  muted: 'bg-muted-foreground',
};

export function statusTone(status?: string | null): Tone {
  const s = (status ?? '').toUpperCase();
  if (['RUNNING', 'FINISHED', 'SUCCESS', 'HEALTHY', 'REACHABLE', 'ONLINE', 'ACTIVE', 'CONNECTED'].some((x) => s.includes(x))) return 'success';
  if (['STARTING', 'QUEUED', 'IN_PROGRESS', 'BUILDING', 'RESTARTING', 'PENDING'].some((x) => s.includes(x))) return 'warning';
  if (['FAILED', 'ERROR', 'DEGRADED', 'UNHEALTHY', 'UNREACHABLE'].some((x) => s.includes(x))) return 'destructive';
  return 'muted';
}

/** "NEEDS_SETUP" -> "Needs setup"; "Needs setup" stays as is. */
export function statusLabel(status: string): string {
  const words = status.replace(/_/g, ' ').trim();
  if (words === words.toUpperCase()) {
    const lower = words.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return words;
}

export function StatusBadge({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      data-tone={resolved}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CLASS[resolved], className)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[resolved])} />
      <span>{statusLabel(status)}</span>
    </span>
  );
}
```

- [ ] **Step 4: Rewrite `stat-card.tsx`**

```tsx
import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  className?: string;
}) {
  const inner = (
    <div className={cn('bg-card border-border rounded-lg border p-4 transition-colors', href && 'hover:bg-secondary', className)}>
      <div className="text-muted-foreground flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        {Icon ? <Icon className="size-4" /> : null}
      </div>
      <div className="text-display mt-2 font-mono font-semibold tracking-tight">{value}</div>
      {hint ? <p className="text-muted-foreground mt-1 text-sm">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
```

Then `grep -rn "accent=" src --include='*.tsx' | grep StatCard` and remove the `accent` prop from every `StatCard` call (dashboard).

- [ ] **Step 5: Rewrite `empty-state.tsx`**

```tsx
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-card border-border w-full rounded-lg border px-4 py-12 text-center', className)}>
      {Icon ? (
        <span className="bg-secondary text-muted-foreground mx-auto grid size-10 place-items-center rounded-lg">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-md mt-4 font-medium">{title}</p>
      {description ? <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-base">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 6: Create `callout.tsx`, delete `doc-callout.tsx`**

```tsx
'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Info, ShieldAlert } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'warning' | 'danger';

const TONE = {
  info: { box: 'border-info/30 bg-info/5', text: 'text-info', Icon: Info },
  warning: { box: 'border-warning/30 bg-warning/5', text: 'text-warning', Icon: AlertTriangle },
  danger: { box: 'border-destructive/30 bg-destructive/5', text: 'text-destructive', Icon: ShieldAlert },
} as const;

export function Callout({
  title,
  tone = 'info',
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
}: {
  title: string;
  tone?: Tone;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <Collapsible defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} className={cn('min-w-0 overflow-hidden rounded-lg border', t.box, className)}>
      <CollapsibleTrigger className={cn('group flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-base font-medium', t.text)}>
        <t.Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className="size-4 shrink-0 opacity-70 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-muted-foreground min-w-0 space-y-3 border-t border-inherit px-3 py-3 text-base">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CalloutSteps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-4">{children}</ol>;
}

export function CalloutBullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-4">{children}</ul>;
}
```

Then in the four importers replace `import { DocCallout, DocSteps, DocBullets } from '@/components/app/doc-callout'` with `import { Callout, CalloutSteps, CalloutBullets } from '@/components/app/callout'` and rename the JSX tags. Delete `doc-callout.tsx`.

- [ ] **Step 7: Rewrite `kind-chip.tsx`**

```tsx
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
```

- [ ] **Step 8: Create `data-table.tsx`**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  onRowClick,
  isLoading = false,
  emptyState,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}) {
  if (!isLoading && rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={cn('bg-card border-border overflow-hidden rounded-lg border', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.key} className={cn(c.align === 'right' && 'text-right', c.className)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((c) => (
                    <TableCell key={c.key}><Skeleton className="h-4 w-2/3" /></TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => {
                const href = rowHref?.(row);
                return (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn((href || onRowClick) && 'cursor-pointer')}
                  >
                    {columns.map((c, i) => (
                      <TableCell key={c.key} className={cn(c.align === 'right' && 'text-right', c.className)}>
                        {href && i === 0 ? (
                          <Link href={href} className="after:absolute after:inset-0 relative font-medium">
                            {c.cell(row)}
                          </Link>
                        ) : (
                          c.cell(row)
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    </div>
  );
}
```

Add `data-slot="skeleton"` to the root element in `src/components/ui/skeleton.tsx` if not present, and `relative` to `TableRow` in `table.tsx` so the stretched link covers the row.

- [ ] **Step 9: Create `list-row.tsx`**

```tsx
import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const content = (
    <>
      {leading ? <span className="text-muted-foreground shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{title}</span>
        {subtitle ? <span className="text-muted-foreground block truncate text-sm">{subtitle}</span> : null}
      </span>
      {meta ? <span className="text-muted-foreground hidden shrink-0 text-sm sm:block">{meta}</span> : null}
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
    </>
  );
  const cls = cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', (href || onClick) && 'hover:bg-secondary', className);
  if (href) return <Link href={href} className={cls}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>;
  return <div className={cls}>{content}</div>;
}
```

- [ ] **Step 10: Run tests, typecheck**

Run: `pnpm vitest run src/components/app && pnpm typecheck`
Expected: PASS. Typecheck may flag `accent` on StatCard and `DocCallout` imports; fix them as instructed above.

- [ ] **Step 11: Commit**

```bash
git add src
git commit -m "feat(app): StatusBadge, StatCard, EmptyState, Callout, KindChip, DataTable, ListRow"
```

---

### Task 7: App shell: sidebar, header, switcher, command palette, modal, confirm, notices, layouts

**Files:**
- Modify: `src/components/app/app-sidebar.tsx`
- Modify: `src/components/app/app-header.tsx`
- Modify: `src/components/app/workspace-switcher.tsx`
- Modify: `src/components/app/command-palette.tsx`
- Modify: `src/components/app/modal.tsx`, `src/components/app/confirm.tsx`
- Modify: `src/components/app/bottom-right-notices.tsx`, `src/components/app/active-deployments-toast.tsx`, `src/components/app/welcome-tutorial-dialog.tsx`, `src/components/app/local-datetime.tsx`
- Modify: `src/components/billing/sidebar-upgrade-pro.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/settings/(workspace)/layout.tsx`
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/components/logo.tsx`
- Test: `src/components/app/__tests__/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: `StatusBadge`, `statusTone` (Task 6); restyled `sidebar.tsx` (Task 4).
- Produces: the settings layout exports `SETTINGS_NAV` (same entries as `BASE_TABS`) rendered as a vertical nav.

- [ ] **Step 1: Write the failing sidebar test**

Create `src/components/app/__tests__/app-sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/servers',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({ user: { name: 'Hiren', email: 'h@x.io' }, clear: vi.fn(), currentWorkspaceId: 'w1', workspaces: [] }),
  currentWorkspace: () => ({ id: 'w1', name: 'Acme', role: 'OWNER' }),
}));
vi.mock('@/lib/queries/service', () => ({ useServiceDetail: () => ({ data: undefined }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ removeQueries: vi.fn() }), useQuery: () => ({ data: [] }) }));
vi.mock('@teispace/next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme: vi.fn() }) }));
vi.mock('@/components/app/workspace-switcher', () => ({ WorkspaceSwitcher: () => <div>ws</div> }));
vi.mock('@/components/billing/sidebar-upgrade-pro', () => ({ SidebarUpgradePro: () => null }));

import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '../app-sidebar';

describe('AppSidebar', () => {
  it('marks the current section active with the neutral pill, not an accent text color', () => {
    render(<SidebarProvider><AppSidebar /></SidebarProvider>);
    const link = screen.getByRole('link', { name: 'Servers' });
    const btn = link.closest('[data-slot="sidebar-menu-button"]')!;
    expect(btn.getAttribute('data-active')).toBe('true');
    expect(btn.className).not.toMatch(/text-phosphor|font-bold|text-\[/);
  });
  it('keeps group labels in sentence case with no tracking', () => {
    render(<SidebarProvider><AppSidebar /></SidebarProvider>);
    const label = screen.getByText('Workspace');
    expect(label.className).not.toMatch(/uppercase|tracking-/);
  });
  it('renders without overflow classes in collapsed icon mode', () => {
    const { container } = render(<SidebarProvider defaultOpen={false}><AppSidebar /></SidebarProvider>);
    expect(container.querySelector('[data-state="collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="sidebar-group-label"]')!.className).toContain('group-data-[collapsible=icon]:hidden');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/components/app/__tests__/app-sidebar.test.tsx`
Expected: FAIL (label text is "Workspace settings", classes contain `text-phosphor`).

- [ ] **Step 3: Restyle `app-sidebar.tsx`**

- Rename the second group label from `'Workspace settings'` to `'Workspace'`.
- `SidebarGroupLabel` className: `text-muted-foreground px-2 text-xs font-medium group-data-[collapsible=icon]:hidden`.
- `SidebarMenuButton` className:

```tsx
className={cn(
  'h-8 rounded-md px-2',
  item.danger
    ? 'text-muted-foreground hover:text-destructive data-[active=true]:bg-destructive/10 data-[active=true]:text-destructive'
    : '',
)}
```
  (the neutral pill, accent icon, and font weight now come from `sidebar.tsx` in Task 4).
- Avatar: `size-6 rounded-full`, fallback `bg-secondary text-xs font-medium`. Remove `border-border-bright`, `text-phosphor`, `text-[10px]`, `font-bold`.
- Footer menu items and theme toggle: `text-base`, no `font-semibold`.
- Header height stays `h-12`; remove `border-b` on the header and footer so the rail reads as one surface, keep `border-r` on the sidebar itself.

- [ ] **Step 4: Restyle `app-header.tsx`**

- Delete `STATUS_DOT` and `statusDotClass`. Import `statusTone` from `./status-badge` and render a dot with `cn('size-1.5 rounded-full', { success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive', info: 'bg-info', muted: 'bg-muted-foreground' }[statusTone(status)])`.
- `SelectorTrigger` className: `h-8 max-w-56 gap-1.5 px-2 text-base` and `label ? 'font-medium' : 'text-muted-foreground'`; remove `active && 'text-phosphor'`.
- Header: `bg-background flex h-12 shrink-0 items-center gap-2 border-b px-4`. The slash separator icon uses `text-muted-foreground`.

- [ ] **Step 5: Restyle `workspace-switcher.tsx` and `command-palette.tsx`**

Remove every `text-[Npx]`, `font-bold`, `text-phosphor`, `text-faint`, `border-border-bright` occurrence using the mapping from Task 4 Step 3. Workspace switcher trigger: `h-8 rounded-md px-2 text-base font-medium hover:bg-sidebar-accent`. Command palette: leave structure, rely on restyled `command.tsx`; group headings `text-xs text-muted-foreground`.

- [ ] **Step 6: Restyle `modal.tsx` and `confirm.tsx`**

- `ModalContent`: `rounded-xl`, header `px-6 pt-6 pb-4` with title `text-lg font-semibold` and description `text-base text-muted-foreground`; body `px-6`; footer `bg-secondary/50 border-t px-6 py-4 flex justify-end gap-2`.
- `confirm.tsx`: destructive confirm uses `variant="destructive"` button; copy in sentence case.

- [ ] **Step 7: Restyle notices, toast, tutorial dialog, local-datetime, sidebar-upgrade-pro**

Apply the mapping table. `sidebar-upgrade-pro.tsx`: card `mx-2 mb-2 rounded-lg border border-border bg-card p-3`, title `text-sm font-medium`, body `text-xs text-muted-foreground`, button `size="sm"` full width. `welcome-tutorial-dialog.tsx`: step titles `text-md font-medium`, body `text-base text-muted-foreground`; if step copy changes, update `src/lib/__tests__/welcome-tutorial.test.ts` in the same commit (run it and read the failing assertion).

- [ ] **Step 8: Settings layout to vertical nav**

Replace `src/app/(app)/settings/(workspace)/layout.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageContainer, PageHeader } from '@/components/app/page';
import { currentWorkspace } from '@/store/auth';
import { cn } from '@/lib/utils';

export const SETTINGS_NAV = [
  { value: 'general', href: '/settings/general', label: 'General', ownerOnly: false },
  { value: 'members', href: '/settings/members', label: 'Members', ownerOnly: false },
  { value: 'subscription', href: '/settings/subscription', label: 'Subscription', ownerOnly: false },
  { value: 'llm', href: '/settings/llm', label: 'LLMs', ownerOnly: false },
  { value: 'audit', href: '/settings/audit', label: 'Audit log', ownerOnly: true },
  { value: 'danger', href: '/settings/danger', label: 'Danger zone', ownerOnly: false },
] as const;

function activeFromPath(pathname: string) {
  return SETTINGS_NAV.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.value ?? 'general';
}

export default function WorkspaceSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = currentWorkspace();
  const isOwner = workspace?.role === 'OWNER';
  const items = SETTINGS_NAV.filter((t) => !t.ownerOnly || isOwner);
  const active = activeFromPath(pathname);

  useEffect(() => {
    if (pathname === '/settings/audit' && workspace && !isOwner) router.replace('/settings/general');
  }, [pathname, workspace, isOwner, router]);

  return (
    <PageContainer>
      <PageHeader title="Workspace settings" description={workspace?.name} />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
          {items.map((t) => (
            <Link
              key={t.value}
              href={t.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-base whitespace-nowrap transition-colors',
                active === t.value ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 9: Auth layout to centered card**

Replace `src/app/(auth)/layout.tsx` with:

```tsx
import { LogoMark } from '@/components/logo';
import { AttributionCapture } from '@/components/auth/attribution-capture';
import { marketingHref } from '@/lib/env';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <a href={marketingHref('/')} className="mb-8 inline-flex items-center gap-2 text-md font-semibold">
        <LogoMark size={28} />
        <span>Peon</span>
      </a>
      <AttributionCapture />
      <div className="bg-card border-border w-full max-w-[400px] rounded-xl border p-8">{children}</div>
    </div>
  );
}
```

- [ ] **Step 10: App layout and logo**

In `src/app/(app)/layout.tsx` keep the structure; confirm the content wrapper is `p-6`. In `logo.tsx` leave the SVG colors (brand asset, out of scope) but remove any `className` that references deleted tokens.

- [ ] **Step 11: Run tests, typecheck, lint count**

Run: `pnpm vitest run src/components/app && pnpm typecheck && pnpm exec eslint src/components/app src/app/\(app\)/layout.tsx 'src/app/(app)/settings/(workspace)/layout.tsx' 'src/app/(auth)/layout.tsx' --rule 'design-tokens/no-off-scale-classes: error'`
Expected: tests PASS, typecheck clean, no design-tokens errors in the listed files.

- [ ] **Step 12: Visual check**

Start the app (`pnpm dev`), open `/dashboard`, toggle theme with `d`, collapse sidebar with `Cmd+B`. Confirm: 240px sidebar, neutral active pill with indigo icon, 12px muted group labels, header breadcrumb unbolded, settings pages show vertical nav at 1280px and horizontal scroll nav at 1024px, login shows a centered card.

- [ ] **Step 13: Commit**

```bash
git add src
git commit -m "feat(shell): Linear-style sidebar, header, settings nav, auth layout, modals"
```

---

### Task 8: Dashboard and projects module

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/projects/page.tsx`
- Modify: `src/app/(app)/projects/[projectId]/page.tsx`
- Modify: `src/components/app/new-service-dialog.tsx`, `src/components/app/template-marketplace.tsx`, `src/components/app/project-members-tab.tsx`, `src/components/app/project-settings-tab.tsx`, `src/components/app/add-server-modal.tsx`
- Modify: `src/components/billing/plan-paywall-dialog.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Panel`, `StatCard`, `ListRow`, `DataTable`, `EmptyState`, `StatusBadge`, `KindChip`, `FormSection`, `FormField`.

Page recipe (applies to every page task from here on):

1. Wrap in `PageContainer`. First child is `PageHeader` with the title and description from the table below and the page's primary action.
2. Replace every `Panel title="lowercase"` with sentence case. Replace `Section` with `Panel`.
3. Replace `divide-y` link lists with `ListRow` inside a `Panel padded={false}` (rows separated with `divide-y` on the wrapper), or with `DataTable` where the list has 3+ columns.
4. Replace hand-rolled forms with `FormSection` + `FormField`, save button in `footer`.
5. Apply the mapping table from Task 4 Step 3 to every remaining className. Remove `uppercase tracking-*` labels except table headers. Remove `lowercase`.
6. Sentence-case all copy. Update any test that asserts on changed copy in the same commit.
7. Run: `pnpm exec eslint <files> --rule 'design-tokens/no-off-scale-classes: error'` until clean, then `pnpm typecheck`, then visual check in both themes at 1280 and 1024 with data, empty, loading, and error states.

| Page | PageHeader title | description | primary action |
|---|---|---|---|
| dashboard | Overview | Workspace at a glance | Add server |
| projects | Projects | Groups of deployable services | New project |
| projects/[id] | project name | project description or "No description" | New service (services tab) |

- [ ] **Step 1: Dashboard**

Stat grid stays `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`. Servers list becomes `Panel title="Servers" padded={false} actions={<Button size="sm">Add server</Button>}` wrapping `<div className="divide-y">` of `ListRow href=… title={s.name} subtitle={s.ip} trailing={<StatusBadge status={label} tone={tone} />}`. Quick links panel: title "Get started", each link a `ListRow` with `leading={<Icon className="size-4" />}`, sentence-case descriptions ("Add a Linux VPS to deploy to over SSH"). Empty server list uses `EmptyState` with the Add server action.

- [ ] **Step 2: Projects list**

Cards grid becomes `DataTable` with columns Name (linked), Services (count, right aligned), Updated (`LocalDateTime`). Empty: `EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to group services that deploy together." action=New project`. New-project modal uses `FormField` rows inside `ModalContent`.

- [ ] **Step 3: Project detail**

Services tab: `DataTable` columns Name (linked), Kind (`KindChip`), Status (`StatusBadge`), Updated. Members tab and settings tab (`project-members-tab.tsx`, `project-settings-tab.tsx`): `DataTable` for members with `RolePill`; settings uses `FormSection title="General"` and a `Panel title="Danger zone"` with a destructive button. `new-service-dialog.tsx` and `template-marketplace.tsx`: kind picker tiles become `rounded-lg border border-border p-4 hover:bg-secondary data-[selected=true]:border-primary`, titles `text-md font-medium`, descriptions `text-sm text-muted-foreground`. `plan-paywall-dialog.tsx`: apply mapping table, primary CTA `variant="default"`.

- [ ] **Step 4: Verify**

Run: `pnpm exec eslint 'src/app/(app)/dashboard' 'src/app/(app)/projects' src/components/app/new-service-dialog.tsx src/components/app/template-marketplace.tsx src/components/app/project-members-tab.tsx src/components/app/project-settings-tab.tsx src/components/app/add-server-modal.tsx src/components/billing/plan-paywall-dialog.tsx --rule 'design-tokens/no-off-scale-classes: error' && pnpm typecheck && pnpm test`
Expected: clean, tests PASS. Visual check per recipe step 7.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(pages): dashboard and projects on the new layout parts"
```

---

### Task 9: Services module: split the 3701-line service page and migrate

**Files:**
- Create directory: `src/components/service/`
- Create: `src/components/service/overview-section.tsx` (moves `OverviewTab`, `Row`, `DetailField`)
- Create: `src/components/service/configuration-section.tsx` (moves `ConfigurationTab`, `Field`, `ToggleField`, `ServiceConfigPanel`, `ConfigFieldInput`)
- Create: `src/components/service/domains-section.tsx` (moves `DomainsTab`, `DomainsField`, `DnsRecordField`, `DnsGuide`, `PreviewDnsGuide`)
- Create: `src/components/service/environment-section.tsx` (moves `EnvironmentTab`, `EnvSection`, `EnvRow`, `EnvDeveloperEditor`)
- Create: `src/components/service/storage-section.tsx` (`StorageTab`)
- Create: `src/components/service/deployments-section.tsx` (`DeploymentsTab`)
- Create: `src/components/service/tasks-section.tsx` (`TasksTab`, `TaskEditor`, `TaskExecutions`)
- Create: `src/components/service/backups-section.tsx` (`BackupsTab`, `BackupEditor`, `BackupExecutions`)
- Create: `src/components/service/logs-section.tsx` (`LogsTab`)
- Create: `src/components/service/terminal-section.tsx` (`TerminalTab`)
- Create: `src/components/service/webhooks-section.tsx` (`WebhooksTab`)
- Create: `src/components/service/danger-section.tsx` (`DangerTab`)
- Modify: `src/app/(app)/projects/[projectId]/services/[serviceId]/page.tsx` (becomes the ~150-line router that renders `PageHeader` + the section)
- Modify: `src/app/(app)/projects/[projectId]/services/[serviceId]/deployments/[deploymentId]/page.tsx`
- Modify: `src/app/(app)/deploy/[slug]/page.tsx`
- Modify: `src/components/app/run-output.tsx`, `src/components/app/redeploy-prompt.tsx`
- Modify: `src/components/billing/access-gate-banner.tsx`

**Interfaces:**
- Produces: each section file default-exports nothing; it named-exports `<Name>Section` with the exact props the old `<Name>Tab` took (copy the signature verbatim). The page imports them by name.

- [ ] **Step 1: Mechanical split, no styling changes yet**

For each section file: cut the listed functions from `page.tsx`, paste into the new file, add `'use client';` and the imports the moved code needs (copy from the page's import block; delete unused ones from the page afterward). Rename `XTab` to `XSection` at the definition and at its single call site in the page. Shared helpers used by more than one section (`Field`, `ToggleField`, `Row`, `DetailField`) go to `src/components/service/fields.tsx` and are imported where needed.

- [ ] **Step 2: Verify the split is behavior-neutral**

Run: `pnpm typecheck && pnpm test && pnpm lint 2>&1 | grep -c "error" `
Expected: typecheck clean, tests pass, zero lint errors (warnings allowed). Open a service in the browser and click through every section; each renders as before.

- [ ] **Step 3: Commit the split**

```bash
git add src
git commit -m "refactor(service): split service detail page into section components"
```

- [ ] **Step 4: Migrate the page router**

`page.tsx` renders `PageContainer` > `PageHeader title={svc.name} description={<span className="flex items-center gap-2"><KindChip kind={svc.kind} /><StatusBadge status={svc.status} /></span>} actions={deploy / restart / stop buttons}` then the active section. Fullscreen sections (logs, terminal) render without `PageContainer` spacing, as today.

- [ ] **Step 5: Migrate each section with the page recipe**

- overview: `KeyValueList` for the detail fields (mono for URLs, IDs, image names); recent deployments as `DataTable` (Status, Commit mono, Started, Duration).
- configuration: every existing `Panel` (git source, build, dockerfile, docker registry, compose, public access, healthcheck) becomes `FormSection` with `FormField` rows and a footer Save button. Titles sentence case.
- domains: `DataTable` of domains with `StatusBadge`; add-domain form in `FormSection`; DNS guides become `Callout tone="info"`.
- environment: `DataTable` columns Key (mono), Value (mono, masked), Actions; developer editor `Textarea` in a `Panel`.
- storage, tasks, backups, webhooks: `DataTable` lists + `FormSection` editors; executions tables via `DataTable`.
- deployments: `DataTable` columns Status, Commit, Trigger, Started, Duration, row links to deployment detail.
- logs, terminal: container `rounded-lg border border-border bg-card overflow-hidden`; log text `font-mono text-sm`.
- danger: `Panel title="Danger zone"` with description and destructive actions; `access-gate-banner.tsx` becomes an `Alert variant="warning"`.
- deployment detail page: `PageHeader title={"Deployment " + short id}` with `StatusBadge` in description; `KeyValueList` for metadata; `run-output.tsx` gets `font-mono text-sm` and log level colors via `text-destructive`, `text-warning`, `text-muted-foreground` only.
- deploy/[slug]: `PageHeader title="Deploy template"`; form in `FormSection`.
- redeploy-prompt: apply mapping table.

- [ ] **Step 6: Verify**

Run: `pnpm exec eslint src/components/service 'src/app/(app)/projects/[projectId]/services' 'src/app/(app)/deploy' src/components/app/run-output.tsx src/components/app/redeploy-prompt.tsx src/components/billing/access-gate-banner.tsx --rule 'design-tokens/no-off-scale-classes: error' && pnpm typecheck && pnpm test`
Expected: clean. Visual check every section in both themes, plus a running deployment's live log.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(service): migrate service, deployment, and deploy pages to the new parts"
```

---

### Task 10: Infra module: servers, storages, keys and tokens, sources, shared variables

**Files:**
- Create: `src/components/server/general-section.tsx`, `advanced-section.tsx`, `proxy-section.tsx`, `destinations-section.tsx`, `danger-section.tsx`, `activity-panel.tsx`, `fields.tsx` (moves `GeneralTab`, `AdvancedTab`, `ProxyTab`, `DestinationsTab`, `DangerTab`, `ServerActivityPanel`, `MetricCard`, `ConnectionStep`, `ConnectionStepConnector`, `ToggleRow`, `NumberField`, `StepLine`, `TabWithActivity` from the 1405-line server page)
- Modify: `src/app/(app)/servers/[serverId]/page.tsx`, `src/app/(app)/servers/page.tsx`
- Modify: `src/app/(app)/storages/page.tsx`, `src/app/(app)/keys-and-tokens/page.tsx`, `src/app/(app)/sources/page.tsx`, `src/app/(app)/sources/[sourceId]/page.tsx`, `src/app/(app)/shared-variables/page.tsx`

| Page | title | description | action |
|---|---|---|---|
| servers | Servers | Machines you deploy to over SSH | Add server |
| servers/[id] | server name | ip in mono + `StatusBadge` | Validate, Terminal |
| storages | Storage | S3-compatible buckets for backups | Add storage |
| keys-and-tokens | Keys and tokens | SSH keys for servers and API tokens for the CLI and MCP | Add key / Create token |
| sources | Git sources | GitHub and GitLab apps that can deploy | Add source |
| sources/[id] | source name | provider label | Open in provider |
| shared-variables | Shared variables | Values available to every service in the workspace | Add variable |

- [ ] **Step 1: Split the server page** the same way as Task 9 Step 1, verify with typecheck and tests, commit `refactor(server): split server detail page into section components`.

- [ ] **Step 2: Migrate with the page recipe**

- servers list: `DataTable` columns Name (linked), IP (mono), Status (`StatusBadge`), Added.
- server detail: tabs stay on the restyled `Tabs`; general section = `KeyValueList` + `FormSection`; `MetricCard` = `StatCard`; connection steps use `text-success`/`text-destructive`/`text-muted-foreground` icons only; destinations `DataTable`; proxy `FormSection`; danger `Panel title="Danger zone"`; activity panel `Panel padded={false}` with `font-mono text-sm` lines.
- storages, sources list, shared variables: `DataTable` + `EmptyState`; add/edit modals with `FormField`.
- keys and tokens: two `Tabs` (SSH keys, API tokens), each a `DataTable`; MCP guide as `Callout`.
- source detail: `KeyValueList` general, resources `DataTable`, GitHub App setup `Callout tone="warning"` when incomplete.

- [ ] **Step 3: Verify**

Run: `pnpm exec eslint src/components/server 'src/app/(app)/servers' 'src/app/(app)/storages' 'src/app/(app)/keys-and-tokens' 'src/app/(app)/sources' 'src/app/(app)/shared-variables' --rule 'design-tokens/no-off-scale-classes: error' && pnpm typecheck && pnpm test`
Expected: clean. Visual check per recipe.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(infra): migrate servers, storage, keys, sources, shared variables"
```

---

### Task 11: Settings, profile, notifications, billing

**Files:**
- Modify: `src/app/(app)/settings/(workspace)/{general,members,llm,subscription,audit,danger}/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/instance/page.tsx`, `src/app/(app)/settings/llms/page.tsx` (redirect stubs: confirm they only redirect; no styling)
- Modify: `src/app/(app)/profile/page.tsx`, `src/app/(app)/profile/instance/page.tsx`, `src/app/(app)/notifications/page.tsx`, `src/app/(app)/security/page.tsx`
- Modify: `src/components/billing/{cancel-reason-picker,charge-preview-block,discount-badge,in-app-subscribe-form,seat-change-preview}.tsx`

| Page | title | description |
|---|---|---|
| settings/general | (layout header) | panel "General" |
| settings/members | | `DataTable` Members (Name, Email mono, Role `RolePill`, Actions) + panel "Pending invitations" |
| settings/llm | | `FormSection` per provider |
| settings/subscription | | `Panel title="Plan"` with `KeyValueList`; seats `FormSection`; billing components restyled |
| settings/audit | | `DataTable` (When, Actor, Action, Target) with filters in a toolbar row |
| settings/danger | | `Panel title="Danger zone"` with description and destructive actions |
| profile | Profile | Your account | |
| profile/instance | Instance | This Peon installation | |
| notifications | Notifications | Where deploy and health alerts go | |
| security | Security | Password and sessions | |

- [ ] **Step 1: Migrate with the page recipe.** Settings pages render no `PageHeader` (the layout owns it). Profile, instance, notifications, security render their own.

- [ ] **Step 2: Billing components:** `discount-badge` = `Badge variant="default"`; `charge-preview-block` and `seat-change-preview` = `KeyValueList` inside a `Panel`; `in-app-subscribe-form` fields in `FormField`, Stripe Element container `rounded-md border border-input bg-card px-3 py-2`; `cancel-reason-picker` radio rows `rounded-md border border-border p-3 has-[:checked]:border-primary`.

- [ ] **Step 3: Verify**

Run: `pnpm exec eslint 'src/app/(app)/settings' 'src/app/(app)/profile' 'src/app/(app)/notifications' 'src/app/(app)/security' src/components/billing --rule 'design-tokens/no-off-scale-classes: error' && pnpm typecheck && pnpm test`
Expected: clean. Visual check including the subscription page with and without an active plan.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(settings): migrate settings, profile, notifications, billing"
```

---

### Task 12: Chat module

**Files:**
- Modify: all 14 files in `src/components/chat/`
- Modify: `src/app/(app)/chat/page.tsx`

**Interfaces:**
- Consumes: tokens, `Button`, `Textarea`, `Callout`.
- Produces: `chat-shell.tsx` layout `grid grid-cols-[260px_1fr]`, conversation column `mx-auto w-full max-w-[720px]`.

- [ ] **Step 1: Layout**

`chat-shell.tsx`: rail `border-r border-border bg-background` 260px, thread rows via `ListRow onClick` with active `bg-secondary`. `conversation-pane.tsx`: scroll area with the centered 720px column, `composer.tsx` pinned at bottom inside the column with `rounded-lg border border-border bg-card` and a single `Textarea` plus send `Button size="icon"`.

- [ ] **Step 2: Messages**

`message-bubble.tsx` becomes a left-aligned row: `grid grid-cols-[28px_1fr] gap-3 py-4`, role marker a `size-7 rounded-md bg-secondary` square with an icon, user rows get `bg-secondary/40 rounded-lg px-4` instead of a colored bubble. `markdown-message.tsx`: prose classes only via `text-base`, code blocks `font-mono text-sm rounded-md bg-secondary p-3`. `tool-card.tsx`, `approval-card.tsx`, `reasoning-panel.tsx`: `Panel` styling (`rounded-lg border border-border bg-card`), header `text-sm font-medium`, collapsed by default. `loading-bubble.tsx`: three dots `bg-muted-foreground`. `model-picker.tsx`: `Button variant="ghost" size="sm"` trigger. `empty-state.tsx`: `EmptyState`. `visual-block.tsx`: keep `CHART_COLORS` (already tokens); axis tick `fill="var(--muted-foreground)"` with `fontSize={11}`; tooltip `contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}`.

- [ ] **Step 3: Verify**

Run: `pnpm exec eslint src/components/chat 'src/app/(app)/chat' --rule 'design-tokens/no-off-scale-classes: error' && pnpm typecheck && pnpm test`
Expected: clean. Visual check with a thread containing a tool call, an approval card, and a chart.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(chat): Linear-style thread rail, centered conversation, message rows"
```

---

### Task 13: Auth, onboarding, invitations, terminal theme

**Files:**
- Modify: `src/app/(auth)/{login,register,forgot-password,reset-password}/page.tsx`
- Modify: `src/app/onboarding/page.tsx`, `src/app/invitations/[token]/page.tsx`, `src/app/page.tsx`
- Modify: `src/components/auth/google-button.tsx`
- Create: `src/components/terminal/xterm-theme.ts`
- Modify: `src/components/terminal/ssh-terminal.tsx`
- Test: `src/components/terminal/__tests__/xterm-theme.test.ts`

**Interfaces:**
- Produces: `xtermTheme(mode: 'dark' | 'light'): ITheme`.

- [ ] **Step 1: Write the failing terminal theme test**

Create `src/components/terminal/__tests__/xterm-theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { xtermTheme } from '../xterm-theme';

describe('xtermTheme', () => {
  it('matches the app surfaces per mode', () => {
    expect(xtermTheme('dark')).toMatchObject({ background: '#111111', foreground: '#EDEDED', cursor: '#7170FF' });
    expect(xtermTheme('light')).toMatchObject({ background: '#FFFFFF', foreground: '#171717', cursor: '#5E6AD2' });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run src/components/terminal`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `xterm-theme.ts`**

```ts
import type { ITheme } from '@xterm/xterm';

export function xtermTheme(mode: 'dark' | 'light'): ITheme {
  return mode === 'dark'
    ? {
        background: '#111111',
        foreground: '#EDEDED',
        cursor: '#7170FF',
        selectionBackground: 'rgba(113, 112, 255, 0.35)',
        black: '#111111', red: '#F0575B', green: '#4ADE80', yellow: '#FBBF24',
        blue: '#60A5FA', magenta: '#7170FF', cyan: '#22D3EE', white: '#EDEDED',
        brightBlack: '#6B6B6B', brightRed: '#F0575B', brightGreen: '#4ADE80', brightYellow: '#FBBF24',
        brightBlue: '#60A5FA', brightMagenta: '#7170FF', brightCyan: '#22D3EE', brightWhite: '#FFFFFF',
      }
    : {
        background: '#FFFFFF',
        foreground: '#171717',
        cursor: '#5E6AD2',
        selectionBackground: 'rgba(94, 106, 210, 0.25)',
        black: '#171717', red: '#DC2626', green: '#16A34A', yellow: '#D97706',
        blue: '#2563EB', magenta: '#5E6AD2', cyan: '#0891B2', white: '#F4F4F5',
        brightBlack: '#6B6B6B', brightRed: '#DC2626', brightGreen: '#16A34A', brightYellow: '#D97706',
        brightBlue: '#2563EB', brightMagenta: '#5E6AD2', brightCyan: '#0891B2', brightWhite: '#FFFFFF',
      };
}
```

- [ ] **Step 4: Wire it into `ssh-terminal.tsx`**

Import `useTheme` from `@teispace/next-themes` and `xtermTheme`. In the mount effect replace the `theme: {...}` object with `theme: xtermTheme(resolvedTheme === 'light' ? 'light' : 'dark')` and `fontFamily: 'var(--font-geist-mono), ui-monospace, monospace'`. Add:

```tsx
useEffect(() => {
  const term = termRef.current;
  if (!term) return;
  term.options.theme = xtermTheme(resolvedTheme === 'light' ? 'light' : 'dark');
}, [resolvedTheme]);
```

The terminal wrapper element gets `bg-card rounded-lg border border-border p-2`.

- [ ] **Step 5: Auth pages**

Each page: heading `<h1 className="text-xl font-semibold">` in sentence case ("Welcome back", "Create your account", "Reset your password", "Choose a new password"), no `uppercase`, subtitle `text-base text-muted-foreground`. Fields in `space-y-4`, labels via `Label`. Divider row text `text-sm text-muted-foreground`. `google-button.tsx`: `Button variant="outline" className="w-full"`. Footer links `text-sm text-muted-foreground` with `text-foreground` link.

- [ ] **Step 6: Onboarding and invitations**

Onboarding: centered `max-w-[560px]` column, step indicator as `text-sm text-muted-foreground` ("Step 1 of 3"), each step a `Panel`; subscribe form via the restyled billing component. Invitations: `Card` centered `max-w-[400px]`, title `text-lg font-semibold`, accept `Button` primary, decline `variant="ghost"`. `src/app/page.tsx` is a redirect; no change beyond confirming no deleted tokens.

- [ ] **Step 7: Verify**

Run: `pnpm vitest run src/components/terminal && pnpm exec eslint 'src/app/(auth)' src/app/onboarding src/app/invitations src/app/page.tsx src/components/auth src/components/terminal --rule 'design-tokens/no-off-scale-classes: error' && pnpm typecheck && pnpm test`
Expected: clean. Visual: open a server terminal, press `d` to toggle theme, the terminal background switches.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(auth,terminal): centered auth pages, onboarding, themed xterm"
```

---

### Task 14: Enforce, clean up, and final verification

**Files:**
- Modify: `eslint.config.mjs` (rule to `error`)
- Modify: `src/components/app/page.tsx` (remove deprecated `Section`)
- Delete: any file with zero importers among the old parts
- Modify: `docs/user-manual.md` only if it references `//` panel titles or lowercase status labels

- [ ] **Step 1: Sweep for deleted tokens**

Run:

```bash
grep -rnE "phosphor|text-faint|bg-faint|border-bright|font-heading|font-display|panel-title-slashes|bg-grid|\\blowercase\\b" src --include='*.tsx' --include='*.ts' --include='*.css'
```

Expected: no output. Fix every hit.

- [ ] **Step 2: Remove `Section` and verify no importers**

Run: `grep -rn "Section\b" src --include='*.tsx' | grep "from '@/components/app/page'"`
Expected: no output. Delete the `Section` export from `page.tsx`.

- [ ] **Step 3: Flip the lint rule to error**

In `eslint.config.mjs` change `"design-tokens/no-off-scale-classes": "warn"` to `"error"`.

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all clean, zero warnings from the design-tokens rule.

- [ ] **Step 5: Full visual pass**

Walk every page from the spec's page list in both themes at 1280 and 1024. Record any defect as a bullet in the PR description with the page and a one-line fix, and fix it before the next step.

- [ ] **Step 6: Rebase onto staging and open the PR**

```bash
git fetch origin && git rebase origin/staging
pnpm lint && pnpm typecheck && pnpm test
git push -u origin redesign/linear-foundation
gh pr create --base staging --title "UI redesign: Vercel/Linear foundation across all pages" --body-file docs/superpowers/specs/2026-09-29-linear-redesign-design.md
```

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A && git commit -m "chore(design): enforce design-tokens rule, remove legacy parts"
```
