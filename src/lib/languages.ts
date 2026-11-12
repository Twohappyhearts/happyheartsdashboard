/**
 * Languages the app supports: English plus Orange County's Medi-Cal threshold languages
 * (CalOptima), with Chinese in both scripts. Same list as public.valid_language_code() in the
 * database (migration 20261111000200).
 *
 * Translations into these languages are machine drafts until the research team reviews them.
 */
export const LANGUAGES = ['en', 'es', 'vi', 'ko', 'zh-Hans', 'zh-Hant', 'fa', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, { english: string; native: string }> = {
  en: { english: 'English', native: 'English' },
  es: { english: 'Spanish', native: 'Español' },
  vi: { english: 'Vietnamese', native: 'Tiếng Việt' },
  ko: { english: 'Korean', native: '한국어' },
  'zh-Hans': { english: 'Chinese (Simplified)', native: '简体中文' },
  'zh-Hant': { english: 'Chinese (Traditional)', native: '繁體中文' },
  fa: { english: 'Farsi', native: 'فارسی' },
  ar: { english: 'Arabic', native: 'العربية' },
};

const RTL = new Set<Language>(['fa', 'ar']);

export const isLanguage = (v: unknown): v is Language => typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

export const dirOf = (lang: Language): 'rtl' | 'ltr' => (RTL.has(lang) ? 'rtl' : 'ltr');

/**
 * The supported language for one tag such as "zh-TW", "es-419" or "en", or null.
 * Chinese goes by script, then region: zh-Hant*, zh-TW, zh-HK, zh-MO → zh-Hant;
 * zh-Hans*, zh, zh-CN, zh-SG and any other zh → zh-Hans.
 */
export function matchLanguage(tag: string | null | undefined): Language | null {
  if (!tag) return null;
  const parts = tag.trim().replace(/_/g, '-').toLowerCase().split('-').filter(Boolean);
  const base = parts[0];
  if (!base) return null;
  if (base === 'zh') {
    const sub = parts.slice(1);
    if (sub.includes('hant')) return 'zh-Hant';
    if (sub.includes('hans')) return 'zh-Hans';
    if (sub.some((s) => s === 'tw' || s === 'hk' || s === 'mo')) return 'zh-Hant';
    return 'zh-Hans';
  }
  return isLanguage(base) ? base : null;
}

/** First supported language among candidates such as "zh-TW", "es-419", "en"; else English. */
export function pickLanguage(...candidates: Array<string | null | undefined>): Language {
  for (const c of candidates) {
    const lang = matchLanguage(c);
    if (lang) return lang;
  }
  return 'en';
}
