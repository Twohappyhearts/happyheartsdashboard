/**
 * Languages the app supports: English plus Orange County's six Medi-Cal threshold
 * languages (CalOptima). Same list as public.valid_language_code() in the database.
 *
 * Translations into these languages are machine drafts until the research team reviews them.
 */
export const LANGUAGES = ['en', 'es', 'vi', 'ko', 'zh', 'fa', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, { english: string; native: string }> = {
  en: { english: 'English', native: 'English' },
  es: { english: 'Spanish', native: 'Español' },
  vi: { english: 'Vietnamese', native: 'Tiếng Việt' },
  ko: { english: 'Korean', native: '한국어' },
  zh: { english: 'Chinese', native: '中文' },
  fa: { english: 'Farsi', native: 'فارسی' },
  ar: { english: 'Arabic', native: 'العربية' },
};

const RTL = new Set<Language>(['fa', 'ar']);

export const isLanguage = (v: unknown): v is Language => typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

export const dirOf = (lang: Language): 'rtl' | 'ltr' => (RTL.has(lang) ? 'rtl' : 'ltr');

/** First supported language among candidates such as "zh-TW", "es-419", "en"; else English. */
export function pickLanguage(...candidates: Array<string | null | undefined>): Language {
  for (const c of candidates) {
    if (!c) continue;
    const base = c.trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}
