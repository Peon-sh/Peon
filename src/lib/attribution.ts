/**
 * First-touch marketing attribution helpers (app.peon.sh).
 * Mirrors peon-website allowlist + peon_attr cookie shape.
 */

export const ATTRIBUTION_COOKIE = 'peon_attr';
export const ATTRIBUTION_STORAGE_KEY = 'peon_attr_session';
export const ATTRIBUTION_MAX_AGE_SEC = 90 * 24 * 60 * 60;
export const ATTRIBUTION_VALUE_MAX = 200;

export const ATTRIBUTION_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'gclid',
  'fbclid',
  'msclkid',
  'campaign',
] as const;

export type AttributionQueryKey = (typeof ATTRIBUTION_QUERY_KEYS)[number];

/** Cookie / URL payload (snake_case keys). */
export type AttributionCookiePayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ref?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  campaign?: string;
  landing_path?: string;
  captured_at?: string;
};

/** API / DB-oriented payload (camelCase). */
export type AttributionInput = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  ref?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  campaign?: string;
  landingPath?: string;
  landingUrl?: string;
  referrer?: string;
  capturedAt?: string;
  rawQuery?: Record<string, string>;
};

function sanitizeValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > ATTRIBUTION_VALUE_MAX) return trimmed.slice(0, ATTRIBUTION_VALUE_MAX);
  return trimmed;
}

export function parseAttributionParams(
  search: string | URLSearchParams,
): AttributionCookiePayload | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out: AttributionCookiePayload = {};
  let found = false;
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const value = params.get(key);
    if (value == null) continue;
    const clean = sanitizeValue(value);
    if (!clean) continue;
    out[key] = clean;
    found = true;
  }
  return found ? out : null;
}

export function hasAttributionFields(
  payload: AttributionCookiePayload | AttributionInput | null | undefined,
): boolean {
  if (!payload) return false;
  if ('utm_source' in payload || 'utm_medium' in payload) {
    return ATTRIBUTION_QUERY_KEYS.some((k) => Boolean((payload as AttributionCookiePayload)[k]));
  }
  const camel = payload as AttributionInput;
  return Boolean(
    camel.utmSource ||
      camel.utmMedium ||
      camel.utmCampaign ||
      camel.utmContent ||
      camel.utmTerm ||
      camel.ref ||
      camel.gclid ||
      camel.fbclid ||
      camel.msclkid ||
      camel.campaign,
  );
}

export function attributionCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  if (host === 'peon.sh' || host.endsWith('.peon.sh')) return '.peon.sh';
  return undefined;
}

function sanitizeCookiePayload(input: AttributionCookiePayload): AttributionCookiePayload | null {
  const out: AttributionCookiePayload = {};
  let found = false;
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const value = input[key];
    if (typeof value !== 'string') continue;
    const clean = sanitizeValue(value);
    if (!clean) continue;
    out[key] = clean;
    found = true;
  }
  if (typeof input.landing_path === 'string' && input.landing_path) {
    out.landing_path = sanitizeValue(input.landing_path) ?? undefined;
  }
  if (typeof input.captured_at === 'string' && input.captured_at) {
    out.captured_at = input.captured_at.slice(0, 40);
  }
  return found ? out : null;
}

export function readAttributionCookie(): AttributionCookiePayload | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
  if (!match) return null;
  const raw = match.slice(ATTRIBUTION_COOKIE.length + 1);
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as AttributionCookiePayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizeCookiePayload(parsed);
  } catch {
    return null;
  }
}

/** First-touch cookie write (for direct landings on app.peon.sh/register?utm_…). */
export function captureFirstTouchAttribution(opts?: {
  search?: string | URLSearchParams;
  pathname?: string;
}): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (readAttributionCookie()) return false;

  const fromQuery = parseAttributionParams(opts?.search ?? window.location.search);
  if (!fromQuery) return false;

  const payload: AttributionCookiePayload = {
    ...fromQuery,
    landing_path: sanitizeValue(opts?.pathname ?? window.location.pathname) ?? '/',
    captured_at: new Date().toISOString(),
  };

  const encoded = encodeURIComponent(JSON.stringify(payload));
  const domain = attributionCookieDomain(window.location.hostname);
  const parts = [
    `${ATTRIBUTION_COOKIE}=${encoded}`,
    'Path=/',
    `Max-Age=${ATTRIBUTION_MAX_AGE_SEC}`,
    'SameSite=Lax',
  ];
  if (window.location.protocol === 'https:') parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  document.cookie = parts.join('; ');
  return true;
}

export function cookiePayloadToInput(
  cookie: AttributionCookiePayload | null,
  extras?: { landingUrl?: string; referrer?: string },
): AttributionInput | null {
  if (!cookie || !hasAttributionFields(cookie)) return null;
  const rawQuery: Record<string, string> = {};
  for (const key of ATTRIBUTION_QUERY_KEYS) {
    const v = cookie[key];
    if (v) rawQuery[key] = v;
  }
  return {
    utmSource: cookie.utm_source,
    utmMedium: cookie.utm_medium,
    utmCampaign: cookie.utm_campaign,
    utmContent: cookie.utm_content,
    utmTerm: cookie.utm_term,
    ref: cookie.ref,
    gclid: cookie.gclid,
    fbclid: cookie.fbclid,
    msclkid: cookie.msclkid,
    campaign: cookie.campaign,
    landingPath: cookie.landing_path,
    landingUrl: extras?.landingUrl ? sanitizeValue(extras.landingUrl) ?? undefined : undefined,
    referrer: extras?.referrer ? sanitizeValue(extras.referrer) ?? undefined : undefined,
    capturedAt: cookie.captured_at,
    rawQuery: Object.keys(rawQuery).length ? rawQuery : undefined,
  };
}

/** Merge cookie + current URL (URL fills missing keys) into API input; stash in sessionStorage. */
export function collectAttributionForSignup(): AttributionInput | null {
  if (typeof window === 'undefined') return null;

  captureFirstTouchAttribution();

  const fromCookie = readAttributionCookie();
  const fromUrl = parseAttributionParams(window.location.search);
  // First-touch: cookie wins over current URL for campaign keys.
  const merged: AttributionCookiePayload = { ...(fromUrl ?? {}), ...(fromCookie ?? {}) };
  if (!merged.landing_path) {
    merged.landing_path = fromCookie?.landing_path ?? window.location.pathname;
  }
  if (!merged.captured_at) {
    merged.captured_at = fromCookie?.captured_at ?? new Date().toISOString();
  }

  const landingUrl = `${window.location.pathname}${window.location.search}`.slice(0, 500);
  const referrer = typeof document !== 'undefined' ? document.referrer.slice(0, 500) : '';
  const input = cookiePayloadToInput(merged, {
    landingUrl,
    referrer: referrer || undefined,
  });

  if (input) {
    try {
      sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(input));
    } catch {
      /* private mode */
    }
  }
  return input ?? readStashedAttribution();
}

export function readStashedAttribution(): AttributionInput | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttributionInput;
    return sanitizeAttributionInput(parsed);
  } catch {
    return null;
  }
}

export function clearStashedAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Server-side sanitize of API attribution body. */
export function sanitizeAttributionInput(input: unknown): AttributionInput | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const pick = (key: string): string | undefined => {
    const v = o[key];
    if (typeof v !== 'string') return undefined;
    return sanitizeValue(v) ?? undefined;
  };
  const out: AttributionInput = {
    utmSource: pick('utmSource'),
    utmMedium: pick('utmMedium'),
    utmCampaign: pick('utmCampaign'),
    utmContent: pick('utmContent'),
    utmTerm: pick('utmTerm'),
    ref: pick('ref'),
    gclid: pick('gclid'),
    fbclid: pick('fbclid'),
    msclkid: pick('msclkid'),
    campaign: pick('campaign'),
    landingPath: pick('landingPath'),
    landingUrl: pick('landingUrl'),
    referrer: pick('referrer'),
    capturedAt: pick('capturedAt'),
  };
  if (o.rawQuery && typeof o.rawQuery === 'object' && !Array.isArray(o.rawQuery)) {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.rawQuery as Record<string, unknown>)) {
      if (typeof v !== 'string') continue;
      const clean = sanitizeValue(v);
      if (clean && (ATTRIBUTION_QUERY_KEYS as readonly string[]).includes(k)) raw[k] = clean;
    }
    if (Object.keys(raw).length) out.rawQuery = raw;
  }
  if (!hasAttributionFields(out)) return null;
  return out;
}
