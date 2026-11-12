import 'server-only';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Reads a resource's website for "Update from websites": one GET, at most 10 seconds and
 * 2 MB, redirects followed by hand (at most 5) so every address is checked, HTML reduced to
 * its readable text.
 *
 * Staff enter these links, but the request runs on our server, so links to local or private
 * networks (localhost, 10.x, 192.168.x, cloud metadata …) are refused. The names are checked
 * with a DNS lookup before the request; a site that changes its DNS answer between the check
 * and the request is not covered.
 */

export const PAGE_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
/** What the model gets at most (about 3,000 tokens). */
export const MAX_PAGE_CHARS = 12_000;
/** Less readable text than this: the page probably needs JavaScript. */
const MIN_TEXT_CHARS = 150;

/** A reason the page could not be read; the message is stored as ai_error (English, see serverMessages). */
export class PageError extends Error {}

export interface PageText {
  /** Address after redirects. */
  url: string;
  title: string;
  description: string;
  text: string;
}

function privateIPv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return privateIPv4(mapped[1]);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PageError('The website is not a valid http:// or https:// link.');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new PageError('The website is not a valid http:// or https:// link.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal|home|lan)$/.test(host)) {
    throw new PageError('The website address points to a local or private network.');
  }
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new PageError('Could not reach the website.');
    }
  }
  if (!addresses.length || addresses.some(privateAddress)) {
    throw new PageError('The website address points to a local or private network.');
  }
  return url;
}

async function readLimited(res: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_BYTES) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const p of parts) {
    const take = Math.min(p.length, out.length - at);
    out.set(p.subarray(0, take), at);
    at += take;
    if (at >= out.length) break;
  }
  return out;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Fetch a website and return its readable text. Throws PageError with the reason. */
export async function fetchPageText(website: string): Promise<PageText> {
  const signal = AbortSignal.timeout(PAGE_TIMEOUT_MS);
  try {
    let url = await assertPublicUrl(website);
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        res = await fetch(url, {
          redirect: 'manual',
          signal,
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CommunityResourceDirectory/1.0)',
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.8',
          },
        });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new PageError('Could not reach the website.');
      }
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!location) break;
      res.body?.cancel().catch(() => {});
      if (hop === MAX_REDIRECTS) throw new PageError('The website redirected too many times.');
      url = await assertPublicUrl(new URL(location, url).toString());
      res = null;
    }
    if (!res) throw new PageError('Could not reach the website.');
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      throw new PageError(`The website answered with HTTP ${res.status}.`);
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    const mime = type.split(';')[0].trim();
    if (mime === 'application/pdf') {
      res.body?.cancel().catch(() => {});
      throw new PageError('The link is a PDF file, not a web page.');
    }
    const isHtml = !mime || mime === 'text/html' || mime === 'application/xhtml+xml';
    if (!isHtml && mime !== 'text/plain') {
      res.body?.cancel().catch(() => {});
      throw new PageError(`The link is not a web page (${mime.slice(0, 60)}).`);
    }
    const body = decode(await readLimited(res, signal), type);
    const page = isHtml ? htmlToText(body) : { title: '', description: '', text: tidy(body) };
    if ((page.title + page.description + page.text).length < MIN_TEXT_CHARS) {
      throw new PageError('The page has almost no readable text (it may need JavaScript to load).');
    }
    return { url: url.toString(), ...page, text: page.text.slice(0, MAX_PAGE_CHARS) };
  } catch (e) {
    if (e instanceof PageError) throw e;
    if (signal.aborted) throw new PageError('The website did not answer within 10 seconds.');
    throw new PageError('Could not reach the website.');
  }
}

// ---------------------------------------------------------------------------------------------
// HTML → text

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', Ntilde: 'Ñ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Collapse spaces, drop empty and repeated lines. */
function tidy(text: string): string {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/[ \t\f\v ]+/g, ' ').trim();
    if (!line || line === '-' || line === lines[lines.length - 1]) continue;
    lines.push(line);
  }
  return lines.join('\n');
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(2).find((v) => v !== undefined) ?? '';

/** Title, meta description and the readable text of an HTML page (scripts, styles, menus removed). */
export function htmlToText(html: string): { title: string; description: string; text: string } {
  const title = tidy(decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')).replace(/\n/g, ' ');
  let description = '';
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = (attr(m[0], 'name') || attr(m[0], 'property')).toLowerCase();
    if (name === 'description' || name === 'og:description') {
      description = tidy(decodeEntities(attr(m[0], 'content'))).replace(/\n/g, ' ');
      if (description) break;
    }
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|head|select|button|nav)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/?(p|div|section|article|main|aside|header|footer|h[1-6]|ul|ol|li|tr|table|thead|tbody|blockquote|dd|dt|dl|form|fieldset|address|figure|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  return { title: title.slice(0, 300), description: description.slice(0, 500), text: tidy(decodeEntities(body)) };
}
