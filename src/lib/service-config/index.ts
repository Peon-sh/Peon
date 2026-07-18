/**
 * Declarative "service-specific configuration" system.
 *
 * Some platforms solve this with a giant switch on the docker image name
 * plus one hand-written form per database engine.
 * We do it declaratively instead:
 *
 *  - COMPOSE (marketplace) services: fields are auto-derived from the magic
 *    env vars the template generated (`SERVICE_USER_X`, `SERVICE_PASSWORD_X`,
 *    `SERVICE_DATABASE_X`, …). Any template can additionally curate or extend
 *    its fields via the `TEMPLATE_CONFIG_OVERRIDES` registry below - adding
 *    support for a new app is one registry entry, not a new component.
 *
 *  - DATABASE services: fields come from the engine's `credentialFields`
 *    declaration in `DATABASE_ENGINES`, so a new engine automatically gets a
 *    correct general form and connection URLs.
 *
 * Field values resolve to either an environment variable (`source: 'env'`)
 * or a Service column (`source: 'column'`); the backend handles both.
 */

export interface ConfigField {
  /** Env var key (source 'env') or Service column name (source 'column'). */
  key: string;
  label: string;
  source: 'env' | 'column';
  isPassword?: boolean;
  required?: boolean;
  helper?: string;
  /** Read-only informational fields (e.g. connection URLs). */
  readonly?: boolean;
}

export interface ConfigSection {
  id: string;
  title: string;
  fields: ConfigField[];
}

/**
 * Optional curation per marketplace template slug. Fields listed here are
 * shown first (with nice labels); auto-derived fields not covered by the
 * override are appended after. To support a new app, add an entry here.
 */
export const TEMPLATE_CONFIG_OVERRIDES: Record<string, ConfigSection[]> = {
  // Example: curate labels for a template whose env keys are cryptic.
  // 'documenso': [
  //   {
  //     id: 'documenso',
  //     title: 'Documenso',
  //     fields: [
  //       { key: 'SERVICE_USER_POSTGRES', label: 'PostgreSQL User', source: 'env', required: true },
  //     ],
  //   },
  // ],
};

const MAGIC_FIELD_COMMANDS: Record<string, { label: string; isPassword: boolean }> = {
  USER: { label: 'User', isPassword: false },
  LOWERCASEUSER: { label: 'User', isPassword: false },
  PASSWORD: { label: 'Password', isPassword: true },
  PASSWORDWITHSYMBOLS: { label: 'Password', isPassword: true },
  DATABASE: { label: 'Database Name', isPassword: false },
  BASE64: { label: 'Secret', isPassword: true },
  REALBASE64: { label: 'Secret', isPassword: true },
  HEX: { label: 'Secret', isPassword: true },
};

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Auto-derive editable fields from a compose service's magic env var keys.
 * `SERVICE_PASSWORD_POSTGRES` → "Postgres · Password" (masked), grouped per
 * identifier so multi-container stacks read naturally.
 */
export function deriveComposeConfigFields(envKeys: string[]): ConfigField[] {
  const fields: ConfigField[] = [];
  for (const key of envKeys) {
    const parts = key.split('_');
    if (parts[0] !== 'SERVICE' || parts.length < 3) continue;
    const command = parts[1];
    const spec = MAGIC_FIELD_COMMANDS[command];
    if (!spec) continue; // FQDN/URL are surfaced in the Domains panel instead.
    // Skip the optional length segment, e.g. SERVICE_PASSWORD_64_SECRET.
    let idx = 2;
    if (/^\d+$/.test(parts[2] ?? '')) idx = 3;
    const identifier = parts.slice(idx).join('_');
    if (!identifier) continue;
    fields.push({
      key,
      label: `${titleCase(identifier)} ${spec.label}`,
      source: 'env',
      isPassword: spec.isPassword,
      required: true,
    });
  }
  // Non-passwords first, then stable by label.
  return fields.sort(
    (a, b) => Number(a.isPassword ?? false) - Number(b.isPassword ?? false) || a.label.localeCompare(b.label),
  );
}

/**
 * Merge a template's curated override sections with auto-derived fields.
 * Curated fields win; auto-derived fields not covered are appended in a
 * generic section.
 */
export function composeConfigSections(
  templateSlug: string | null,
  envKeys: string[],
): ConfigSection[] {
  const overrides = templateSlug ? (TEMPLATE_CONFIG_OVERRIDES[templateSlug] ?? []) : [];
  const covered = new Set(overrides.flatMap((s) => s.fields.map((f) => f.key)));
  const derived = deriveComposeConfigFields(envKeys).filter((f) => !covered.has(f.key));
  const sections = [...overrides];
  if (derived.length > 0) {
    sections.push({ id: 'generated', title: 'Service Specific Configuration', fields: derived });
  }
  return sections;
}
