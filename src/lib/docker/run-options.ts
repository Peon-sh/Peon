/**
 * Parser: docker run flags → Compose service fields.
 * Unknown flags are ignored.
 */

const LIST_OPTIONS = new Set([
  '--cap-add',
  '--cap-drop',
  '--security-opt',
  '--sysctl',
  '--ulimit',
  '--device',
  '--shm-size',
  '--dns',
]);

const MAPPING: Record<string, string> = {
  '--cap-add': 'cap_add',
  '--cap-drop': 'cap_drop',
  '--security-opt': 'security_opt',
  '--sysctl': 'sysctls',
  '--device': 'devices',
  '--init': 'init',
  '--ulimit': 'ulimits',
  '--privileged': 'privileged',
  '--ip': 'ip',
  '--ip6': 'ip6',
  '--shm-size': 'shm_size',
  '--dns': 'dns',
  '--gpus': 'gpus',
  '--hostname': 'hostname',
  '--entrypoint': 'entrypoint',
};

type FlagValues = Record<string, string[] | true>;

function parseFlagBag(custom: string): FlagValues {
  const options: FlagValues = {};
  const flagRe = /(--\w+(?:-\w+)*)(?:\s|=)?([^\s-]+)?/g;
  let match: RegExpExecArray | null;
  while ((match = flagRe.exec(custom)) !== null) {
    const option = match[1]!;

    if (option === '--gpus') {
      const deviceMatch = custom.match(/device=([0-9A-Za-z-,]+)/);
      const value = deviceMatch?.[1] ?? 'all';
      const list = Array.isArray(options[option]) ? (options[option] as string[]) : [];
      list.push(value);
      options[option] = [...new Set(list)];
      continue;
    }

    if (option === '--hostname') {
      const hostMatch = custom.match(/--hostname(?:=|\s+)([^\s]+)/);
      const value = hostMatch?.[1]?.trim();
      if (value) {
        options[option] = [value];
      }
      continue;
    }

    if (option === '--entrypoint') {
      const epMatch = custom.match(
        /--entrypoint(?:=|\s+)("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+)/,
      );
      const raw = epMatch?.[1];
      if (!raw) continue;
      let value: string;
      if (raw.startsWith('"') && raw.endsWith('"')) {
        value = raw.slice(1, -1).replace(/\\(["$`\\])/g, '$1');
      } else if (raw.startsWith("'") && raw.endsWith("'")) {
        value = raw.slice(1, -1);
      } else {
        value = raw;
      }
      if (value.trim()) {
        options[option] = [value];
      }
      continue;
    }

    if (match[2]) {
      const list = Array.isArray(options[option]) ? (options[option] as string[]) : [];
      list.push(match[2]);
      options[option] = [...new Set(list)];
    } else {
      options[option] = true;
    }
  }
  return options;
}

function parseUlimits(values: string[]): Record<string, { soft: string; hard?: string }> {
  const ulimits: Record<string, { soft: string; hard?: string }> = {};
  for (const ulimit of values) {
    const [type, rest] = ulimit.split('=');
    if (!type || rest == null) continue;
    const limits = rest.split(':');
    if (limits.length === 2) {
      ulimits[type] = { soft: limits[0]!, hard: limits[1]! };
    } else {
      ulimits[type] = { soft: rest };
    }
  }
  return ulimits;
}

/** Convert `docker run` flag string into Compose service keys. */
export function convertDockerRunToCompose(
  customDockerRunOptions?: string | null,
): Record<string, unknown> {
  if (!customDockerRunOptions?.trim()) return {};

  const options = parseFlagBag(customDockerRunOptions);
  const compose: Record<string, unknown> = {};

  for (const [option, value] of Object.entries(options)) {
    const key = MAPPING[option];
    if (!key) continue;

    if (option === '--ulimit' && Array.isArray(value)) {
      compose[key] = parseUlimits(value);
      continue;
    }

    if ((option === '--shm-size' || option === '--hostname' || option === '--entrypoint') && Array.isArray(value)) {
      const first = value[0]?.trim();
      if (first) compose[key] = first;
      continue;
    }

    if (option === '--gpus' && Array.isArray(value)) {
      const payload: Record<string, unknown> = {
        driver: 'nvidia',
        capabilities: ['gpu'],
      };
      const devices = value[0]?.trim();
      if (devices && devices !== 'all') {
        payload.device_ids = devices.includes(',') ? devices.split(',') : [devices];
      }
      compose.deploy = {
        resources: {
          reservations: {
            devices: [payload],
          },
        },
      };
      continue;
    }

    if (LIST_OPTIONS.has(option) && Array.isArray(value)) {
      compose[key] = value;
      continue;
    }

    compose[key] = value;
  }

  return compose;
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const existing = out[k];
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Merge parsed docker-run options into a Compose service object.
 * `--ip` / `--ip6` become static addresses on `network`.
 */
export function mergeDockerRunIntoService(
  service: Record<string, unknown>,
  network: string,
  customDockerRunOptions?: string | null,
): Record<string, unknown> {
  const custom = convertDockerRunToCompose(customDockerRunOptions);
  if (Object.keys(custom).length === 0) return service;

  const ips = Array.isArray(custom.ip) ? (custom.ip as string[]) : [];
  const ip6s = Array.isArray(custom.ip6) ? (custom.ip6 as string[]) : [];
  const ipv4 = ips[0];
  const ipv6 = ip6s[0];
  delete custom.ip;
  delete custom.ip6;

  let result = { ...service };
  if (ipv4 || ipv6) {
    result.networks = {
      [network]: {
        ...(ipv4 ? { ipv4_address: ipv4 } : {}),
        ...(ipv6 ? { ipv6_address: ipv6 } : {}),
      },
    };
  }

  return deepMerge(result, custom);
}
