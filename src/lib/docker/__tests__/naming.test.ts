import { describe, expect, it } from 'vitest';
import { containerName, proxyRouterName } from '../naming';

describe('proxyRouterName', () => {
  const serviceName = 'WebApp';
  const serviceUuid = 'cmrprod00000000000000001';
  const previewContainer = containerName('WebApp-pr-37', 'cmrpreview000000000001');

  it('keeps production on the stable service uuid name (rolling-safe)', () => {
    expect(
      proxyRouterName({
        isPreview: false,
        deploymentContainerName: 'webapp-rolling-deadbeef',
        serviceName,
        serviceUuid,
      }),
    ).toBe(containerName(serviceName, serviceUuid));
  });

  it('uses the preview container name so Traefik routers do not collide with production', () => {
    expect(
      proxyRouterName({
        isPreview: true,
        deploymentContainerName: previewContainer,
        serviceName,
        serviceUuid,
      }),
    ).toBe(previewContainer);
    expect(previewContainer).not.toBe(containerName(serviceName, serviceUuid));
  });
});
