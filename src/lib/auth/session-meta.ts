export type SessionDeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type SessionRequestMeta = {
  ip: string | null;
  userAgent: string | null;
  acceptLanguage: string | null;
  browser: string | null;
  browserEngine: string | null;
  os: string | null;
  deviceType: SessionDeviceType;
  deviceName: string | null;
  platform: string | null;
  country: string | null;
};

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

function firstLanguage(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim().split(';')[0]?.trim();
  return first || null;
}

function parseSecChUaBrand(secChUa: string | null): string | null {
  if (!secChUa) return null;
  // Prefer non-"Not" brands: "Chromium";v="131", "Google Chrome";v="131"
  const matches = [...secChUa.matchAll(/"([^"]+)";v="([^"]+)"/g)];
  const preferred =
    matches.find((m) => m[1] && !/^Not[/\s]?A/i.test(m[1]) && m[1] !== 'Chromium') ??
    matches.find((m) => m[1] === 'Chromium') ??
    matches[0];
  if (!preferred) return null;
  return `${preferred[1]} ${preferred[2]}`.trim();
}

export function parseUserAgent(ua: string | null): {
  browser: string | null;
  browserEngine: string | null;
  os: string | null;
  deviceType: SessionDeviceType;
  deviceName: string | null;
} {
  if (!ua) {
    return {
      browser: null,
      browserEngine: null,
      os: null,
      deviceType: 'unknown',
      deviceName: null,
    };
  }

  let browser: string | null = null;
  let browserEngine: string | null = null;

  const edg = ua.match(/Edg(?:e|A|iOS)?\/([\d.]+)/);
  const opera = ua.match(/OPR\/([\d.]+)/);
  const chrome = ua.match(/Chrome\/([\d.]+)/);
  const firefox = ua.match(/Firefox\/([\d.]+)/);
  const safari = ua.match(/Version\/([\d.]+).*Safari/);
  const samsung = ua.match(/SamsungBrowser\/([\d.]+)/);

  if (edg) {
    browser = `Edge ${edg[1]}`;
    browserEngine = 'Blink';
  } else if (opera) {
    browser = `Opera ${opera[1]}`;
    browserEngine = 'Blink';
  } else if (samsung) {
    browser = `Samsung Internet ${samsung[1]}`;
    browserEngine = 'Blink';
  } else if (chrome && !ua.includes('Chromium')) {
    browser = `Chrome ${chrome[1]}`;
    browserEngine = 'Blink';
  } else if (firefox) {
    browser = `Firefox ${firefox[1]}`;
    browserEngine = 'Gecko';
  } else if (safari) {
    browser = `Safari ${safari[1]}`;
    browserEngine = 'WebKit';
  } else if (chrome) {
    browser = `Chromium ${chrome[1]}`;
    browserEngine = 'Blink';
  }

  let os: string | null = null;
  let deviceName: string | null = null;
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X ([\d_]+)/i.test(ua)) {
    const ver = ua.match(/Mac OS X ([\d_]+)/i)?.[1]?.replace(/_/g, '.');
    os = ver ? `macOS ${ver}` : 'macOS';
    deviceName = 'Mac';
  } else if (/Android ([\d.]+)/i.test(ua)) {
    const ver = ua.match(/Android ([\d.]+)/i)?.[1];
    os = ver ? `Android ${ver}` : 'Android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    const ver = ua.match(/OS ([\d_]+)/i)?.[1]?.replace(/_/g, '.');
    os = ver ? `iOS ${ver}` : 'iOS';
  } else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'Chrome OS';

  let deviceType: SessionDeviceType = 'desktop';
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) deviceType = 'tablet';
  else if (/Mobile|iPhone|Android.*Mobile|webOS|BlackBerry/i.test(ua)) deviceType = 'mobile';

  if (/iPhone/i.test(ua)) deviceName = 'iPhone';
  else if (/iPad/i.test(ua)) deviceName = 'iPad';

  return { browser, browserEngine, os, deviceType, deviceName };
}

/** Extract login-session metadata from incoming request headers. */
export function extractSessionMeta(headers: Headers): SessionRequestMeta {
  const userAgent = headers.get('user-agent');
  const parsed = parseUserAgent(userAgent);

  const secChUa = headers.get('sec-ch-ua');
  const secPlatform = headers.get('sec-ch-ua-platform')?.replace(/"/g, '') ?? null;
  const secMobile = headers.get('sec-ch-ua-mobile');
  const secModel = headers.get('sec-ch-ua-model')?.replace(/"/g, '') || null;

  const chBrand = parseSecChUaBrand(secChUa);
  if (chBrand) parsed.browser = chBrand;
  if (secPlatform) {
    parsed.os = parsed.os ?? secPlatform;
  }
  if (secMobile === '?1') parsed.deviceType = 'mobile';
  else if (secMobile === '?0' && parsed.deviceType === 'unknown') parsed.deviceType = 'desktop';
  if (secModel && secModel !== 'null') parsed.deviceName = secModel;

  const ip =
    firstForwardedIp(headers.get('x-forwarded-for')) ??
    headers.get('x-real-ip') ??
    null;

  const country =
    headers.get('cf-ipcountry') ??
    headers.get('x-vercel-ip-country') ??
    null;

  return {
    ip,
    userAgent,
    acceptLanguage: firstLanguage(headers.get('accept-language')),
    browser: parsed.browser,
    browserEngine: parsed.browserEngine,
    os: parsed.os,
    deviceType: parsed.deviceType,
    deviceName: parsed.deviceName,
    platform: secPlatform,
    country: country && country !== 'XX' ? country : null,
  };
}
