import { en, type StaffText } from './en';
import { es } from './es';

/**
 * Language of the staff dashboard: English or Spanish (Spanish is a machine translation,
 * pending research-team review). The patient chat (/m/assistant) has its own eight languages in
 * src/lib/i18n/patient.ts and does not use this.
 *
 * The choice is kept in the hh_staff_lang cookie: server components read it with getStaffText()
 * (./server), client components with useStaffT() (./context).
 */
export type { StaffText };

export const STAFF_LANGS = ['en', 'es'] as const;
export type StaffLang = (typeof STAFF_LANGS)[number];

export const STAFF_LANG_COOKIE = 'hh_staff_lang';

export const STAFF_LANG_NAMES: Record<StaffLang, string> = { en: 'English', es: 'Español' };

/** Locale for dates and numbers. es-US: Spanish as written in the US (12-hour clock, "11 nov 2026"). */
export const STAFF_LOCALES: Record<StaffLang, string> = { en: 'en-US', es: 'es-US' };

export const isStaffLang = (v: unknown): v is StaffLang => v === 'en' || v === 'es';

type Dict = { [key: string]: unknown };
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `over` on top of `base`, key by key: a key that is missing or empty in `over` keeps the English text. */
function withFallback<T>(base: T, over: unknown): T {
  if (!isDict(base) || !isDict(over)) return (over === undefined || over === '' ? base : over) as T;
  const out: Dict = {};
  for (const key of Object.keys(base)) out[key] = withFallback(base[key], over[key]);
  return out as T;
}

export const STAFF_TEXT: Record<StaffLang, StaffText> = {
  en,
  es: withFallback(en, es),
};

export const staffTextFor = (lang: StaffLang): StaffText => STAFF_TEXT[lang];

/**
 * The language the dashboard shows in this browser tab, for code outside React (error messages
 * thrown by src/lib/*, toasts from contexts). Set by StaffLangProvider on the client only; on the
 * server it stays English (server code reads the cookie instead).
 */
let current: StaffLang = 'en';

export function setCurrentStaffLang(lang: StaffLang) {
  if (typeof window !== 'undefined') current = lang;
}

export const currentStaffLang = (): StaffLang => current;
export const staffText = (): StaffText => STAFF_TEXT[current];
export const staffLocale = (): string => STAFF_LOCALES[current];
