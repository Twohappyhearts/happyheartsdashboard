import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/**
 * Survey Links (dashboard Prompt 5). Surveys are built and answered in REDCap;
 * we only store the public links + how the app lists them. The app opens
 * `url + &participant_code=<username>` in a web view.
 * When REDCap redirects to SURVEY_COMPLETE_URL?code=<CODE> after the last page,
 * the app records a completion (public.survey_completions).
 */

export const REDCAP_PREFIX = 'https://ci-redcap.hs.uci.edu/surveys/?s=';
export const SURVEY_COMPLETE_URL = 'https://io.happyhearts.app/survey-complete';
export const CODE_RE = /^[A-Z][A-Z0-9_]{0,49}$/;

export const SURVEY_CATEGORIES = ['Emotional Assessment', 'Basic Needs Assessment'] as const;
export const SURVEY_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'As needed', 'One time'] as const;

/**
 * Where the app lists a link (survey_links.placement). Both open the same way (REDCap web view).
 * The dashboard shows these labels in its own language (staff text `surveys.placements`).
 */
export type SurveyPlacement = 'resource' | 'survey';
export const SURVEY_PLACEMENTS: { value: SurveyPlacement; label: string; hint: string }[] = [
  { value: 'resource', label: 'Resources', hint: 'Resources tab (bottom navigation)' },
  { value: 'survey', label: 'Holistic Assessments', hint: 'Holistic Assessments, in the side menu' },
];
export const placementLabel = (p: SurveyPlacement) => SURVEY_PLACEMENTS.find((x) => x.value === p)?.label ?? 'Resources';

export interface SurveyLink {
  id: string;
  title: string;
  code: string;
  url: string;
  description: string;
  category: string;
  frequency: string;
  duration: string;
  placement: SurveyPlacement;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

export type SurveyInput = Omit<SurveyLink, 'id' | 'createdAt'>;

export class SurveyError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;

function fail(e: { code?: string; message?: string } | null, fallback: string): SurveyError {
  if (!e) return new SurveyError(fallback);
  const E = staffText().surveys.errors;
  if (e.code === '42501') return new SurveyError(staffText().common.noStaffPermission, e.code);
  if (e.code === '23505') return new SurveyError(E.codeTaken, e.code);
  if (e.code === '23514') return new SurveyError(E.tooLong, e.code);
  if (e.code === 'PGRST204' || e.code === '42703') {
    return new SurveyError(E.missingColumns, e.code);
  }
  return new SurveyError(e.message || fallback, e.code);
}

const COLUMNS = 'id, title, code, url, description, category, frequency, duration, placement, sort_order, is_active, created_at';

function toSurvey(r: Row): SurveyLink {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    code: String(r.code ?? ''),
    url: String(r.url ?? ''),
    description: String(r.description ?? ''),
    category: String(r.category ?? ''),
    frequency: String(r.frequency ?? ''),
    duration: String(r.duration ?? ''),
    placement: r.placement === 'survey' ? 'survey' : 'resource',
    sortOrder: Number(r.sort_order ?? 0) || 0,
    active: Boolean(r.is_active),
    createdAt: String(r.created_at ?? ''),
  };
}

function toRow(input: SurveyInput) {
  return {
    title: input.title.trim(),
    code: input.code.trim().toUpperCase(),
    url: input.url.trim(),
    description: input.description.trim(),
    category: input.category.trim() || null,
    frequency: input.frequency.trim() || null,
    duration: input.duration.trim() || null,
    placement: input.placement === 'survey' ? 'survey' : 'resource',
    sort_order: Math.max(0, Math.min(10000, Math.round(input.sortOrder || 0))),
    is_active: input.active,
  };
}

export async function listSurveys(supabase: SupabaseClient): Promise<SurveyLink[]> {
  const { data, error } = await supabase
    .from('survey_links')
    .select(COLUMNS)
    .order('sort_order')
    .order('title');
  if (error) throw fail(error, staffText().surveys.errors.load);
  return ((data as Row[] | null) ?? []).map(toSurvey);
}

export async function createSurvey(supabase: SupabaseClient, input: SurveyInput): Promise<SurveyLink> {
  const { data, error } = await supabase.from('survey_links').insert(toRow(input)).select(COLUMNS).single();
  if (error) throw fail(error, staffText().surveys.errors.add);
  return toSurvey(data as Row);
}

export async function updateSurvey(supabase: SupabaseClient, id: string, input: SurveyInput): Promise<SurveyLink> {
  const { data, error } = await supabase.from('survey_links').update(toRow(input)).eq('id', id).select(COLUMNS).single();
  if (error) throw fail(error, staffText().surveys.errors.save);
  return toSurvey(data as Row);
}

export async function setSurveyActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('survey_links').update({ is_active: active }).eq('id', id);
  if (error) throw fail(error, staffText().surveys.errors.visibility);
}

export async function deleteSurvey(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('survey_links').delete().eq('id', id);
  if (error) throw fail(error, staffText().surveys.errors.delete);
}

/** Exactly what the app opens for a participant. */
export function personalizedLink(url: string, username: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}participant_code=${encodeURIComponent(username)}`;
}

/** URL to paste into REDCap > Survey Settings > "Redirect to a URL". */
export function completionRedirect(code: string): string {
  return `${SURVEY_COMPLETE_URL}?code=${encodeURIComponent(code)}`;
}

export interface CompletionInfo {
  count: number;
  lastAt: string;
}

/** userId -> completions of one survey. */
export async function completionsForSurvey(
  supabase: SupabaseClient,
  surveyId: string,
): Promise<Map<string, CompletionInfo>> {
  const { data, error } = await supabase
    .from('survey_completions')
    .select('user_id, completed_at')
    .eq('survey_id', surveyId)
    .order('completed_at', { ascending: false })
    .limit(5000);
  if (error) throw fail(error, staffText().surveys.errors.completions);
  const map = new Map<string, CompletionInfo>();
  for (const r of (data as Row[] | null) ?? []) {
    const uid = String(r.user_id);
    const cur = map.get(uid);
    if (cur) cur.count += 1;
    else map.set(uid, { count: 1, lastAt: String(r.completed_at) });
  }
  return map;
}

/** surveyId -> number of completions (all patients). */
export async function completionCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('survey_completions').select('survey_id').limit(10000);
  if (error) throw fail(error, staffText().surveys.errors.completions);
  const map = new Map<string, number>();
  for (const r of (data as Row[] | null) ?? []) {
    if (!r.survey_id) continue;
    const id = String(r.survey_id);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}
