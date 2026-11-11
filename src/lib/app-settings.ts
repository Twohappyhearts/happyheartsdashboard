import type { SupabaseClient } from '@supabase/supabase-js';
import { LANGUAGES, isLanguage, type Language } from '@/lib/languages';

/**
 * Settings the research team controls from the dashboard (public.app_settings, key → JSON).
 * Any signed-in user can read them (the app and the AI assistant do); staff can change them.
 *
 * message_languages: the languages the research team reads in messages from patients, e.g.
 * ["en","es"]. The app shows a notice when a patient writes to the team in another language,
 * and messages the AI assistant drafts for a patient are written in the FIRST language.
 * It does not change the language the AI assistant answers in.
 */

export const MESSAGE_LANGUAGES_KEY = 'message_languages';
/** Same as the row the migration adds (20261111000100). */
export const DEFAULT_MESSAGE_LANGUAGES: Language[] = ['en', 'es'];

export interface MessageLanguagesSetting {
  /** 1 to LANGUAGES.length distinct codes; the first one is the language of AI-drafted messages. */
  languages: Language[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export class SettingsError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** A valid list (at least one, distinct supported codes from LANGUAGES, order kept), or null. */
export function parseLanguageList(value: unknown): Language[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > LANGUAGES.length) return null;
  if (!value.every(isLanguage)) return null;
  return new Set(value).size === value.length ? (value as Language[]) : null;
}

/**
 * The stored list with unknown codes dropped (e.g. a code no longer supported), order kept;
 * the default when nothing usable is left.
 */
export function readLanguageList(value: unknown): Language[] {
  const known = Array.isArray(value) ? value.filter(isLanguage) : [];
  const list = Array.from(new Set(known));
  return list.length > 0 ? list : DEFAULT_MESSAGE_LANGUAGES;
}

function fail(e: { code?: string; message?: string }, fallback: string): SettingsError {
  if (e.code === '42501') return new SettingsError('Your account does not have staff permission for this.', e.code);
  if (e.code === '42P01' || e.code === 'PGRST205') {
    return new SettingsError('The settings table is missing. Run the latest database migration first.', e.code);
  }
  if (e.code === '23514') return new SettingsError('Choose at least one language from the list.', e.code);
  return new SettingsError(`${fallback}${e.message ? `: ${e.message}` : ''}`, e.code);
}

export async function getMessageLanguages(supabase: SupabaseClient): Promise<MessageLanguagesSetting> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value, updated_at, updated_by')
    .eq('key', MESSAGE_LANGUAGES_KEY)
    .maybeSingle();
  if (error) throw fail(error, 'Could not load the settings');
  return {
    languages: readLanguageList(data?.value),
    updatedAt: (data?.updated_at as string | null | undefined) ?? null,
    updatedBy: (data?.updated_by as string | null | undefined) ?? null,
  };
}

export async function saveMessageLanguages(
  supabase: SupabaseClient,
  languages: Language[],
  userId: string
): Promise<MessageLanguagesSetting> {
  const value = parseLanguageList(languages);
  if (!value) throw new SettingsError('Choose at least one language.');
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key: MESSAGE_LANGUAGES_KEY, value, updated_by: userId }, { onConflict: 'key' })
    .select('value, updated_at, updated_by')
    .single();
  if (error) throw fail(error, 'Could not save the settings');
  return {
    languages: parseLanguageList(data.value) ?? value,
    updatedAt: (data.updated_at as string | null) ?? null,
    updatedBy: (data.updated_by as string | null) ?? null,
  };
}
