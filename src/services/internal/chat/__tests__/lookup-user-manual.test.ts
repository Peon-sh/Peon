import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearUserManualCache,
  loadUserManual,
  lookupUserManual,
  parseManualSections,
  searchManualSections,
  userManualPath,
} from '../lookup-user-manual';

const SAMPLE = `# Title

## Servers

Add and manage Linux hosts.

### Add and connect

1. Create server with SSH key.
2. Connect until healthy.

## Domains and HTTPS

Add FQDN and force HTTPS.

### Common errors

Certificate not issuing when DNS is wrong.
`;

describe('user manual lookup', () => {
  beforeEach(() => {
    clearUserManualCache();
  });

  it('parses ## and ### sections', () => {
    const sections = parseManualSections(SAMPLE);
    expect(sections.map((s) => s.heading)).toEqual([
      'Servers',
      'Add and connect',
      'Domains and HTTPS',
      'Common errors',
    ]);
    expect(sections[0]?.level).toBe(2);
    expect(sections[1]?.level).toBe(3);
    expect(sections[1]?.body).toContain('Create server');
  });

  it('ranks sections by query keywords', () => {
    const sections = parseManualSections(SAMPLE);
    const matches = searchManualSections(sections, 'how do I add a server with SSH');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.heading).toMatch(/server|connect/i);
  });

  it('biases toward section hint', () => {
    const sections = parseManualSections(SAMPLE);
    const matches = searchManualSections(sections, 'errors', 'Domains and HTTPS');
    expect(matches[0]?.heading).toMatch(/Common errors|Domains/i);
  });

  it('loads the real docs/user-manual.md from cwd', async () => {
    const { sections } = await loadUserManual({ forceReload: true });
    expect(userManualPath()).toContain('docs/user-manual.md');
    expect(sections.some((s) => s.heading === 'Servers')).toBe(true);
    expect(sections.some((s) => /Getting started/i.test(s.heading))).toBe(true);
  });

  it('lookupUserManual returns capped matches', async () => {
    const result = await lookupUserManual({ query: 'transfer ownership leave workspace' });
    expect(result.source).toBe('docs/user-manual.md');
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches.length).toBeLessThanOrEqual(5);
    expect(result.matches[0]?.heading).toBeTruthy();
    expect(result.matches[0]?.excerpt.length).toBeGreaterThan(0);
  });
});
