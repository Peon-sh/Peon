# Peon UI redesign: Vercel/Linear direction

Date: 2026-09-29
Status: approved for planning

## Intent

The current UI reads as "vibe coded": a phosphor-terminal identity that is only
half applied, ad-hoc pixel font sizes in 54 files, raw Tailwind palette colors
bypassing tokens, no page titles, and four competing panel treatments. The goal
is a UI that looks like it came from one hand, in the vein of Vercel and Linear:
neutral surfaces, one restrained accent, strong typography, purposeful spacing.

Success means every page and component in `src/` uses only the new tokens, type
scale, and shared parts, in both dark and light themes, with no behavior change.

## Decisions made

| Question | Decision |
|---|---|
| Visual identity | Clean infra-SaaS, Vercel/Linear reference bar |
| Accent | Indigo, Linear-style: `#5E6AD2` light, `#7170FF` dark |
| Logo and favicon | Unchanged for now; recolor is a separate task |
| Fonts | Geist Sans everywhere, Geist Mono for code and values. Archivo, Inter, IBM Plex Mono removed |
| Themes | Dark and light both supported, dark default |
| Rollout | Big bang on one long-lived branch, weekly rebase onto staging |
| Structure | Approach B: refresh shadcn primitives in place, rebuild the app-level parts, migrate every page onto them |

## Section 1: Foundation

### Color

Two neutral scales with no green cast.

- Light: white panels, gray-50 page background, gray-200 borders, gray-900 text, gray-500 muted text.
- Dark: `#0A0A0A` page, `#111111` panels, `#1F1F1F` borders, `#EDEDED` text, `#A1A1A1` muted text.
- Accent: indigo `#5E6AD2` light, `#7170FF` dark. Used for primary buttons, focus rings, active nav icon, links.
- Semantic: success green, warning amber, destructive red, info blue. Desaturated slightly in dark mode. Exposed as `--success`, `--warning`, `--destructive`, `--info` tokens only.
- Charts: `--chart-1` is the accent; `--chart-2..5` are hues chosen not to fight it.
- Deleted tokens: `--phosphor`, `--phosphor-dim`, `--violet`, `--faint`, `--border-bright`. Every usage migrates to a surviving token.

### Typography

- Geist Sans via `next/font/google` as `--font-sans`; Geist Mono as `--font-mono`. `--font-heading` and `--font-display` removed.
- Scale (Tailwind theme, no arbitrary values): `caption` 11px, `sm` 12px, `base` 13px (body default), `md` 14px, `lg` 16px, `xl` 20px, `display` 28px.
- Weights: 400, 500, 600 only.
- No uppercase tracked labels except 11px table headers. No `//` prefixes. Sentence case for all UI copy; Title Case only for sidebar nav items.
- Mono is used for IDs, IPs, env vars, logs, and numeric stat values.

### Spacing and shape

- 4px grid. Page padding 24px, panel padding 16px, control gap 8px.
- Radius: 6px controls, 8px panels, 10px dialogs.
- Borders 1px solid. No shadows in dark mode. One subtle shadow level in light mode, popovers and dialogs only.

### Controls

- Heights: 32px default, 28px small, 36px large. Text 13px.
- Focus: 2px accent ring with 2px offset.
- Hover: one background step, never a hue change.

### Enforcement

An ESLint rule (custom `no-restricted-syntax` on JSX className strings) fails on
`text-[Npx]` arbitrary sizes and on raw palette classes matching
`(bg|text|border|ring)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+`
anywhere under `src/`. `globals.css` is the only place raw hex values appear.

## Section 2: Shared app parts

All live in `src/components/app/`. Pages compose only these plus the ui primitives.

| Part | Purpose | Replaces |
|---|---|---|
| `PageHeader` | 20px/600 title, optional muted description, right-aligned actions. Every page renders one. | deprecated `PageHeader` in `page.tsx` |
| `Panel` | Bordered surface, optional header row (14px/500 title, actions), optional footer band. | current `Panel`, `Section`, in-page `Card` usage |
| `DataTable` | Column definitions, 11px uppercase muted headers, 13px rows, hover, optional row link, built-in empty and loading states. | hand-rolled tables and `divide-y` lists on servers, projects, deployments, members, audit, keys |
| `ListRow` | Leading icon or avatar, title, subtitle, trailing meta and status. | dashboard servers list, storages, sources, notifications rows |
| `StatCard` | Muted label, 28px mono value, hint. Accent only via icon. | current `StatCard` |
| `StatusBadge` | Pill with dot and sentence-case label, tones: success, warning, destructive, info, muted. | lowercase text badge; raw color dots in `app-header.tsx` |
| `EmptyState` | Icon, title, one-line description, primary action. Solid border. | dashed `EmptyState` |
| `FormSection` | Title, description, two-column fields on wide screens, sticky footer with Cancel and Save. | ad-hoc forms on every settings page and service config section |
| `KeyValueList` | Label/value rows for detail views. | ad-hoc grids on server detail, deployment detail |
| `Callout` | Info, warning, danger notes. | `doc-callout.tsx` amber styling |

Shell:

- Sidebar: 240px, no group boxes, muted 11px section labels, active item is a filled neutral pill with accent icon, workspace switcher at top, user menu at bottom.
- Header: keeps breadcrumb selectors, drops bold and accent text, uses `StatusBadge` dots.
- Settings layout: Linear-style vertical nav on the left of the content.
- Auth layout: centered 400px card on the page background, no grid backdrop.

## Section 3: Complete inventory

Every file listed here is touched. None may remain on deleted tokens or arbitrary sizes.

### UI primitives, restyled in place (28)

alert-dialog, alert, avatar, badge, button, card, checkbox, collapsible,
command, dialog, dropdown-menu, input-group, input, label, popover,
scroll-area, searchable-select, select, separator, sheet, sidebar, skeleton,
sonner, switch, table, tabs, textarea, tooltip. No API changes.

### App parts (23 existing, 2 new)

page (split into PageHeader, Panel, FormSection, KeyValueList), stat-card,
status-badge, empty-state, doc-callout (renamed Callout), kind-chip, modal,
confirm, app-header, app-sidebar, workspace-switcher, command-palette,
add-server-modal, new-service-dialog, template-marketplace,
project-members-tab, project-settings-tab, redeploy-prompt, run-output,
active-deployments-toast, bottom-right-notices, welcome-tutorial-dialog,
local-datetime. New: data-table, list-row.

### Auth (2)

google-button (restyled as outline button), attribution-capture (no visual output, verified only).

### Billing (8)

access-gate-banner, cancel-reason-picker, charge-preview-block,
discount-badge, in-app-subscribe-form, plan-paywall-dialog,
seat-change-preview, sidebar-upgrade-pro.

### Chat (14)

chat-shell, thread-rail, conversation-pane, message-list, message-bubble,
markdown-message, composer, model-picker, tool-card, approval-card,
reasoning-panel, visual-block, loading-bubble, empty-state.

Chat layout: narrow thread rail (260px), centered 720px conversation column,
bubbles replaced with left-aligned message rows with a small role marker,
composer pinned at bottom with a single border.

### Terminal (1)

ssh-terminal: xterm theme object mapped from the new tokens for both themes.

### Root (2)

logo (asset unchanged, sized for the new sidebar), theme-provider (unchanged behavior).

### Layouts (4)

root layout (fonts), app shell layout, settings workspace layout, auth layout.

### Pages (33)

dashboard, chat, projects, project detail (services, members, settings tabs),
service detail and every section it renders, deployment detail, deploy by slug,
servers, server detail, storages, keys and tokens, sources, source detail,
shared variables, notifications, security, profile, profile instance,
settings hub, settings general, members, LLM, subscription, audit, danger,
instance settings, LLMs, login, register, forgot password, reset password,
invitation accept, onboarding, root redirect.

Page recipe: `PageHeader` on top; content in `Panel`, `DataTable`, or `ListRow`
groups; forms in `FormSection`; no raw layout divs beyond grid wrappers.

## Section 4: Process, testing, risk

### Branch and order

Branch `redesign/linear-foundation` off `staging`. Rebase onto staging weekly
and after any marketplace fix merges.

Order:

1. Foundation: tokens, fonts, lint rule, ui primitives.
2. App parts.
3. Shell and dashboard.
4. Projects and services (including deployments).
5. Infra: servers, storages, keys and tokens, sources, shared variables.
6. Settings and billing.
7. Chat.
8. Auth and onboarding.
9. Long tail: notifications, security, profile, audit, danger, invitations.

### Verification

- Existing unit tests pass; tests asserting on copy are updated in the same commit as the copy change.
- Per page, in both themes, at 1280px and 1024px: default, empty, loading, error states checked visually.
- `pnpm typecheck` and `pnpm lint` clean, including the new rule, before merge.
- No new visual regression tooling.

### Out of scope

Logo and favicon recolor, marketing site, behavior or data changes, new
features, layouts below 1024px beyond not breaking.

### Risks

- Copy changes break text assertions: update in the same commit.
- Recharts and xterm do not read CSS tokens: wire theme objects explicitly.
- Chat is the largest rewrite: scheduled late so the foundation is stable.
- Long-lived branch drift: weekly rebase mitigates.
