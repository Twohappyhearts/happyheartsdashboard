import { STAFF_TEXT, type StaffLang } from './index';

/**
 * Translates an English message from the dashboard's API routes or the knowledge-base processing
 * (staff text section `serverMessages`) into the dashboard language. A message that is not in
 * the list is returned unchanged (e.g. a raw database error).
 *
 * Used on the server by staffJsonError() (src/lib/server/staff-auth.ts) and on the client for
 * messages stored in the database or returned inside a result (document errors, chunk results,
 * search warnings).
 */
type Fn = (...args: string[]) => string;

interface Catalog {
  exact: Map<string, string>;
  patterns: { key: string; re: RegExp }[];
}

let catalog: Catalog | null = null;

const sentinel = (i: number) => `\u0000${i}\u0000`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Static texts by their English wording; functions as patterns built from their English output. */
function compile(): Catalog {
  const exact = new Map<string, string>();
  const patterns: Catalog['patterns'] = [];
  for (const [key, value] of Object.entries(STAFF_TEXT.en.serverMessages)) {
    if (typeof value === 'string') {
      exact.set(value, key);
    } else if (typeof value === 'function') {
      const fn = value as Fn;
      const args = Array.from({ length: fn.length }, (_, i) => sentinel(i));
      let source = escapeRe(fn(...args));
      args.forEach((a) => (source = source.replace(a, '([\\s\\S]+?)')));
      patterns.push({ key, re: new RegExp(`^${source}$`) });
    }
  }
  return { exact, patterns };
}

export function translateServerMessage(message: string, lang: StaffLang, depth = 0): string {
  if (lang === 'en' || !message || depth > 3) return message;
  catalog ??= compile();
  const target = STAFF_TEXT[lang].serverMessages as unknown as Record<string, string | Fn>;
  const key = catalog.exact.get(message);
  if (key) return target[key] as string;
  for (const { key: k, re } of catalog.patterns) {
    const m = re.exec(message);
    if (m) return (target[k] as Fn)(...m.slice(1).map((part) => translateServerMessage(part, lang, depth + 1)));
  }
  return message;
}
