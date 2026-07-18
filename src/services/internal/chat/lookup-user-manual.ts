import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';

export type ManualSection = {
  heading: string;
  level: 2 | 3;
  body: string;
};

export type ManualMatch = {
  heading: string;
  excerpt: string;
  score: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MATCHES = 5;
const MAX_EXCERPT_CHARS = 2500;

let cache: { loadedAt: number; text: string; sections: ManualSection[] } | null = null;

/** Resolve docs/user-manual.md relative to process cwd (repo root / Docker workdir). */
export function userManualPath(cwd = process.cwd()): string {
  return path.join(cwd, 'docs', 'user-manual.md');
}

/** Split markdown into ## / ### sections for keyword search. */
export function parseManualSections(markdown: string): ManualSection[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: ManualSection[] = [];
  let current: ManualSection | null = null;

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h2 || h3) {
      if (current) {
        current.body = current.body.trim();
        sections.push(current);
      }
      current = {
        heading: (h2?.[1] ?? h3![1]).trim(),
        level: h2 ? 2 : 3,
        body: '',
      };
      continue;
    }
    if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) {
    current.body = current.body.trim();
    sections.push(current);
  }
  return sections;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
}

/** Rank sections by overlap with query (+ optional section heading hint). */
export function searchManualSections(
  sections: ManualSection[],
  query: string,
  sectionHint?: string,
): ManualMatch[] {
  const queryTokens = tokenize(query);
  const hintTokens = sectionHint ? tokenize(sectionHint) : [];
  if (queryTokens.length === 0 && hintTokens.length === 0) {
    return [];
  }

  const scored = sections.map((section) => {
    const haystack = `${section.heading}\n${section.body}`.toLowerCase();
    const headingLower = section.heading.toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      if (headingLower.includes(token)) score += 4;
      if (haystack.includes(token)) score += 1;
    }
    for (const token of hintTokens) {
      if (headingLower.includes(token)) score += 6;
      else if (haystack.includes(token)) score += 2;
    }
    if (sectionHint && headingLower.includes(sectionHint.toLowerCase().trim())) {
      score += 10;
    }

    const excerpt =
      section.body.length > MAX_EXCERPT_CHARS
        ? `${section.body.slice(0, MAX_EXCERPT_CHARS).trim()}…`
        : section.body;

    return {
      heading: section.heading,
      excerpt: excerpt || '(no body)',
      score,
    };
  });

  return scored
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.heading.localeCompare(b.heading))
    .slice(0, MAX_MATCHES);
}

export async function loadUserManual(options?: {
  cwd?: string;
  forceReload?: boolean;
}): Promise<{ text: string; sections: ManualSection[] }> {
  const now = Date.now();
  if (
    !options?.forceReload &&
    cache &&
    now - cache.loadedAt < CACHE_TTL_MS
  ) {
    return { text: cache.text, sections: cache.sections };
  }

  const filePath = userManualPath(options?.cwd);
  const text = await readFile(filePath, 'utf8');
  const sections = parseManualSections(text);
  cache = { loadedAt: now, text, sections };
  return { text, sections };
}

/** Test helper — clear in-memory cache. */
export function clearUserManualCache(): void {
  cache = null;
}

export async function lookupUserManual(input: {
  query: string;
  section?: string;
  cwd?: string;
}): Promise<{
  source: string;
  matchCount: number;
  matches: Array<{ heading: string; excerpt: string }>;
}> {
  const { sections } = await loadUserManual({ cwd: input.cwd });
  const matches = searchManualSections(sections, input.query, input.section);
  return {
    source: 'docs/user-manual.md',
    matchCount: matches.length,
    matches: matches.map(({ heading, excerpt }) => ({ heading, excerpt })),
  };
}

/** Chat-only tool: search the in-repo user manual for how-to guidance. */
export function createLookupUserManualTool() {
  return tool({
    description:
      'Look up how-to guidance from the Peon user manual (UI navigation, roles, workflows). Use for questions like "how do I…", where a feature lives, or what permissions are needed. Do not use for live workspace state — use list/get tools for that.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe('Natural-language question or keywords (e.g. "add domain", "transfer ownership")'),
      section: z
        .string()
        .optional()
        .describe('Optional heading hint to bias search (e.g. "Servers", "Environment variables")'),
    }),
    execute: async ({ query, section }) => lookupUserManual({ query, section }),
  });
}
