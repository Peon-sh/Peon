import { describe, expect, it } from 'vitest';
import { convertDockerRunToCompose, mergeDockerRunIntoService } from '../run-options';

describe('convertDockerRunToCompose', () => {
  it('parses hostname with = and without', () => {
    expect(convertDockerRunToCompose('--hostname=test')).toEqual({ hostname: 'test' });
    expect(convertDockerRunToCompose('--hostname my-super-host')).toEqual({
      hostname: 'my-super-host',
    });
  });

  it('parses repeated cap-add', () => {
    expect(
      convertDockerRunToCompose('--cap-add=NET_ADMIN --cap-add=NET_RAW --cap-add SYS_ADMIN'),
    ).toEqual({
      cap_add: ['NET_ADMIN', 'NET_RAW', 'SYS_ADMIN'],
    });
  });

  it('parses dns and boolean flags', () => {
    expect(convertDockerRunToCompose('--cap-add=NET_ADMIN --dns 10.0.0.10 --init')).toEqual({
      cap_add: ['NET_ADMIN'],
      dns: ['10.0.0.10'],
      init: true,
    });
  });

  it('parses ulimit soft:hard', () => {
    expect(convertDockerRunToCompose('--ulimit nofile=262144:262144')).toEqual({
      ulimits: {
        nofile: { soft: '262144', hard: '262144' },
      },
    });
  });

  it('parses gpus all and device ids', () => {
    expect(convertDockerRunToCompose('--gpus all')).toEqual({
      deploy: {
        resources: {
          reservations: {
            devices: [{ driver: 'nvidia', capabilities: ['gpu'] }],
          },
        },
      },
    });
    expect(convertDockerRunToCompose('--gpus "device=0,1"')).toEqual({
      deploy: {
        resources: {
          reservations: {
            devices: [
              {
                driver: 'nvidia',
                capabilities: ['gpu'],
                device_ids: ['0', '1'],
              },
            ],
          },
        },
      },
    });
  });

  it('parses entrypoint quoted and plain', () => {
    expect(convertDockerRunToCompose('--entrypoint /bin/sh')).toEqual({
      entrypoint: '/bin/sh',
    });
    expect(convertDockerRunToCompose('--entrypoint "sh -c npm install"')).toEqual({
      entrypoint: 'sh -c npm install',
    });
  });

  it('ignores unknown flags', () => {
    expect(convertDockerRunToCompose('--rm --name foo --cap-add SYS_ADMIN')).toEqual({
      cap_add: ['SYS_ADMIN'],
    });
  });
});

describe('mergeDockerRunIntoService', () => {
  it('merges caps and preserves existing fields', () => {
    const merged = mergeDockerRunIntoService(
      { image: 'nginx', container_name: 'web', restart: 'unless-stopped' },
      'peon',
      '--cap-add SYS_ADMIN --privileged',
    );
    expect(merged).toMatchObject({
      image: 'nginx',
      container_name: 'web',
      cap_add: ['SYS_ADMIN'],
      privileged: true,
    });
  });

  it('maps --ip onto the compose network', () => {
    const merged = mergeDockerRunIntoService(
      { image: 'nginx', networks: ['peon'] },
      'peon',
      '--ip 10.0.0.5',
    );
    expect(merged.networks).toEqual({
      peon: { ipv4_address: '10.0.0.5' },
    });
  });

  it('deep-merges deploy reservations with existing limits', () => {
    const merged = mergeDockerRunIntoService(
      {
        image: 'app',
        deploy: { resources: { limits: { cpus: '0.5' } } },
      },
      'peon',
      '--gpus all',
    );
    expect(merged.deploy).toEqual({
      resources: {
        limits: { cpus: '0.5' },
        reservations: {
          devices: [{ driver: 'nvidia', capabilities: ['gpu'] }],
        },
      },
    });
  });
});

describe('preview mode (untrusted PR code)', () => {
  const dangerous =
    '--privileged --device=/dev/sda --cap-add=SYS_ADMIN --security-opt seccomp=unconfined --sysctl net.ipv4.ip_forward=1 --gpus all --ip 10.0.0.5';

  it('drops privilege-widening flags', () => {
    expect(convertDockerRunToCompose(dangerous, { preview: true })).toEqual({});
    // Production behaviour is unchanged.
    expect(convertDockerRunToCompose(dangerous)).toMatchObject({
      privileged: true,
      devices: ['/dev/sda'],
      cap_add: ['SYS_ADMIN'],
    });
  });

  it('keeps benign flags', () => {
    expect(
      convertDockerRunToCompose(`--privileged --init --shm-size 1g --hostname web`, {
        preview: true,
      }),
    ).toEqual({ init: true, shm_size: '1g', hostname: 'web' });
  });

  it('mergeDockerRunIntoService does not add privileged or static ips in preview', () => {
    const out = mergeDockerRunIntoService({ image: 'x' }, 'net', dangerous, { preview: true });
    expect(out).toEqual({ image: 'x' });
  });
});
