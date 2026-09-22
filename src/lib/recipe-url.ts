/** Recognising and cleaning the links people share, before anything is fetched. */

export type UrlKind = 'social' | 'web' | 'unsupported';

const SOCIAL_HOSTS = ['instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'facebook.com', 'fb.watch'];
const UNSUPPORTED_HOSTS = ['pinterest.com', 'pin.it'];

/** Params that only identify the sharer or the campaign - they change nothing about the recipe. */
const TRACKING_PARAMS = [
  'igshid', 'igsh', 'fbclid', 'gclid', 'mibextid', 'si', '_t', '_r', 'ref', 'ref_src', 'share_id',
];

const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i;

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Pulls the first http(s) link out of shared text, which is where Android puts it. */
export function firstUrlIn(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = candidate.match(/https?:\/\/[^\s<>"']+/i);
    if (match) return match[0].replace(/[)\].,]+$/, '');
  }
  return null;
}

export interface ParsedUrl {
  url: string;
  host: string;
  kind: UrlKind;
}

/**
 * Validates and normalises a shared link. Returns null for anything we must not fetch:
 * a non-http scheme, or a host that points back inside our own network.
 */
export function parseSharedUrl(raw: string): ParsedUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();
  if (!host || PRIVATE_HOST.test(host) || !host.includes('.')) return null;

  for (const param of TRACKING_PARAMS) parsed.searchParams.delete(param);
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) parsed.searchParams.delete(key);
  }
  parsed.hash = '';

  const kind: UrlKind = hostMatches(host, UNSUPPORTED_HOSTS)
    ? 'unsupported'
    : hostMatches(host, SOCIAL_HOSTS)
      ? 'social'
      : 'web';

  return { url: parsed.toString(), host, kind };
}

/**
 * Where to send someone after they sign in. Only ever a path inside this app: an absolute or
 * protocol-relative URL here would be an open redirect.
 */
export function safeNextPath(value: unknown): string {
  const next = typeof value === 'string' ? value : '';
  return /^\/(?!\/)\S*$/.test(next) ? next : '/';
}
