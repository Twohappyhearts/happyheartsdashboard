import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { matchLanguage, type Language } from '@/lib/languages';

/**
 * Settings the research team controls on the dashboard's Settings page (public.app_settings).
 *
 * message_languages: the languages the research team reads in messages from patients. Care-team
 * messages the assistant drafts are written in the first one (an exact zh-Hans / zh-Hant code
 * stays as it is). English when the setting is missing or cannot be read.
 *
 * Cached for a minute because every agent turn asks.
 */

const TTL_MS = 60_000;
/** After a failed read, try again sooner. */
const RETRY_MS = 10_000;

let cache: { until: number; value: Language } | null = null;

export async function careTeamLanguage(admin: SupabaseClient): Promise<Language> {
  if (cache && Date.now() < cache.until) return cache.value;
  try {
    const { data, error } = await admin.from('app_settings').select('value').eq('key', 'message_languages').maybeSingle();
    if (error) throw error;
    const list: unknown[] = Array.isArray(data?.value) ? (data.value as unknown[]) : [];
    const value = matchLanguage(typeof list[0] === 'string' ? list[0] : null) ?? 'en';
    cache = { until: Date.now() + TTL_MS, value };
    return value;
  } catch (e) {
    console.warn('[agent] could not read app_settings.message_languages; care-team messages in English', e instanceof Error ? e.message : e);
    cache = { until: Date.now() + RETRY_MS, value: 'en' };
    return 'en';
  }
}

/** For tests. */
export function clearSettingsCache() {
  cache = null;
}
