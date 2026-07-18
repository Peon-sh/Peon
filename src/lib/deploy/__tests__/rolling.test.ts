import { describe, expect, it } from 'vitest';
import {
  hasHostPortMappings,
  rollingComposeProject,
  rollingContainerName,
  shouldUseRollingUpdate,
} from '../rolling';

describe('hasHostPortMappings', () => {
  it('detects host:container mappings', () => {
    expect(hasHostPortMappings('8080:3000')).toBe(true);
    expect(hasHostPortMappings('3000,8443:443')).toBe(true);
    expect(hasHostPortMappings('3000')).toBe(false);
    expect(hasHostPortMappings(null)).toBe(false);
    expect(hasHostPortMappings('')).toBe(false);
  });
});

describe('shouldUseRollingUpdate', () => {
  const base = {
    kind: 'GIT_APP',
    fqdn: 'https://app.example.com',
    ports: '3000',
    rollingUpdate: true,
  };

  it('enables rolling for domain-routed apps by default', () => {
    expect(shouldUseRollingUpdate(base)).toBe(true);
    expect(shouldUseRollingUpdate({ ...base, rollingUpdate: undefined })).toBe(true);
    expect(shouldUseRollingUpdate({ ...base, kind: 'DOCKER_IMAGE' })).toBe(true);
    expect(shouldUseRollingUpdate({ ...base, kind: 'NIXPACKS' })).toBe(true);
  });

  it('disables when setting off, consistent name, preview, or wrong kind', () => {
    expect(shouldUseRollingUpdate({ ...base, rollingUpdate: false })).toBe(false);
    expect(shouldUseRollingUpdate({ ...base, isConsistentContainerNameEnabled: true })).toBe(false);
    expect(shouldUseRollingUpdate({ ...base, isPreview: true })).toBe(false);
    expect(shouldUseRollingUpdate({ ...base, kind: 'DATABASE' })).toBe(false);
    expect(shouldUseRollingUpdate({ ...base, kind: 'COMPOSE' })).toBe(false);
  });

  it('disables without fqdn or with host port mappings', () => {
    expect(shouldUseRollingUpdate({ ...base, fqdn: null })).toBe(false);
    expect(shouldUseRollingUpdate({ ...base, ports: '8080:3000' })).toBe(false);
  });
});

describe('rolling naming', () => {
  it('builds deployment-scoped container and compose project names', () => {
    expect(rollingContainerName('My App', 'cmdeploy12345678')).toMatch(/^my-app-/);
    expect(rollingComposeProject('cmserviceuuid123', 'cmdeploy99')).toMatch(/^peon-/);
  });
});
