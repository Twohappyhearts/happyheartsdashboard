import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { splitSources } from '@/lib/agent-sources';
import { ApiError, type StaffCaller } from '@/lib/server/staff-auth';
import {
  FEEDBACK_BUCKETS,
  FEEDBACK_RANGES,
  type FeedbackAggregate,
  type FeedbackBucket,
  type FeedbackFilters,
  type FeedbackRange,
  type FeedbackStats,
  type RatedAnswer,
  type RatedAnswerFacets,
  type RatedAnswerFilters,
} from '@/lib/ai-feedback';

/**
 * AI Feedback (Analytics › AI Feedback and its list of rated answers): patients' ratings of the
 * assistant's answers. The numbers are computed in the database (staff_ai_feedback_stats and
 * friends, migration 20261125000100_ai_feedback_stats.sql); only aggregates leave for the
 * statistics. The list of rated answers shows patients' questions, answers and comments, so
 * every list or export request is written to audit_log first (no record, no data).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<FeedbackRange, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validTimeZone(tz: string | null): string {
  if (!tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function text(params: URLSearchParams, key: string, max: number): string | null {
  const v = (params.get(key) ?? '').trim();
  if (!v || v === 'all') return null;
  if (v.length > max) throw new ApiError(400, 'Invalid request.');
  return v;
}

function score(params: URLSearchParams, key: string, max: number): number | null {
  const v = params.get(key);
  if (v == null || v === '' || v === 'all') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ApiError(400, 'Invalid request.');
  return n;
}

export function parseFeedbackFilters(params: URLSearchParams): FeedbackFilters {
  const range = (params.get('range') ?? '30d') as FeedbackRange;
  if (!FEEDBACK_RANGES.includes(range)) throw new ApiError(400, 'Invalid request.');
  return { range, language: text(params, 'language', 32), model: text(params, 'model', 200) };
}

export function parseRatedAnswerFilters(params: URLSearchParams): RatedAnswerFilters {
  return {
    ...parseFeedbackFilters(params),
    usability: score(params, 'usability', 5),
    safety: score(params, 'safety', 3),
    withComment: params.get('comment') === '1',
    search: (params.get('q') ?? '').trim().slice(0, 100),
  };
}

const fromOf = (range: FeedbackRange) => {
  const days = RANGE_DAYS[range];
  return days == null ? null : new Date(Date.now() - days * DAY_MS).toISOString();
};

type Row = Record<string, any>;

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const nums = (v: unknown, length: number): number[] => Array.from({ length }, (_, i) => Number((v as unknown[] | null)?.[i] ?? 0));
const shares = (v: unknown, length: number): (number | null)[] =>
  Array.from({ length }, (_, i) => num((v as unknown[] | null)?.[i]));

function toAggregate(r: Row | null | undefined): FeedbackAggregate {
  return {
    answers: Number(r?.answers ?? 0),
    rated: Number(r?.rated ?? 0),
    patients: Number(r?.patients ?? 0),
    raters: Number(r?.raters ?? 0),
    topRater: Number(r?.top_rater ?? 0),
    nUsability: Number(r?.n_u ?? 0),
    nSafety: Number(r?.n_s ?? 0),
    comments: Number(r?.comments ?? 0),
    avgUsability: num(r?.avg_u),
    top2Share: num(r?.top2_share),
    avgSafety: num(r?.avg_s),
    usabilityCount: nums(r?.u_count, 5),
    usabilityShare: shares(r?.u_share, 5),
    safetyCount: nums(r?.s_count, 3),
    safetyShare: shares(r?.s_share, 3),
  };
}

/** Every number of the AI Feedback tab. */
export async function feedbackStats(
  admin: SupabaseClient,
  filters: FeedbackFilters,
  options: { perPatient: boolean; bucket: FeedbackBucket; timeZone: string | null },
): Promise<FeedbackStats> {
  if (!FEEDBACK_BUCKETS.includes(options.bucket)) throw new ApiError(400, 'Invalid request.');
  const { data, error } = await admin.rpc('staff_ai_feedback_stats', {
    p_from: fromOf(filters.range),
    p_language: filters.language,
    p_model: filters.model,
    p_per_patient: options.perPatient,
    p_bucket: options.bucket,
    p_tz: validTimeZone(options.timeZone),
  });
  if (error) throw error;
  const d = (data ?? {}) as Row;
  const group = (rows: unknown) => ((rows as Row[] | null) ?? []).map((r) => ({ key: String(r.key), ...toAggregate(r) }));
  return {
    overall: toAggregate(d.overall),
    buckets: group(d.buckets),
    groups: { source: group(d.groups?.source), model: group(d.groups?.model), language: group(d.groups?.language) },
    options: {
      languages: ((d.options?.languages as string[] | null) ?? []).map(String),
      models: ((d.options?.models as string[] | null) ?? []).map(String),
    },
  };
}

// ---------------------------------------------------------------- rated answers

export interface RatedAnswerCursor {
  at: string;
  id: string;
}

export function decodeAnswerCursor(value: string | null): RatedAnswerCursor | null {
  if (!value) return null;
  const [at, id] = value.split('|');
  if (!at || !id || !UUID.test(id) || Number.isNaN(Date.parse(at))) throw new ApiError(400, 'Invalid request.');
  return { at, id };
}

function rpcArgs(f: RatedAnswerFilters) {
  return {
    p_from: fromOf(f.range),
    p_language: f.language,
    p_model: f.model,
    p_usability: f.usability,
    p_safety: f.safety,
    p_with_comment: f.withComment,
    p_search: f.search || null,
  };
}

const toAnswer = (r: Row): RatedAnswer => ({
  messageId: r.message_id as string,
  conversationId: r.conversation_id as string,
  answeredAt: r.answered_at as string,
  participant: (r.display_id as string | null) || (r.username ? `@${r.username}` : null),
  language: r.language as string,
  model: r.model as string,
  usability: num(r.usability),
  safety: num(r.safety),
  comment: (r.comment as string | null) ?? null,
  question: ((r.question as string | null) ?? '').trim(),
  answer: splitSources(((r.answer as string | null) ?? '').trim()).text,
});

async function recordAccess(
  admin: SupabaseClient,
  caller: StaffCaller,
  action: string,
  filters: RatedAnswerFilters,
  rows: Row[],
) {
  const patients = [...new Set(rows.map((r) => r.user_id as string))];
  const { error } = await admin.from('audit_log').insert({
    actor_id: caller.userId,
    actor_role: caller.role,
    action,
    target_type: 'agent_answer_ratings',
    target_id: null,
    subject_user_id: patients.length === 1 ? patients[0] : null,
    details: { filters, answers: rows.map((r) => r.message_id as string), patients },
  });
  if (error) throw error;
}

/** One page of rated answers (newest first) with the counts for the filters. */
export async function listRatedAnswers(
  admin: SupabaseClient,
  caller: StaffCaller,
  filters: RatedAnswerFilters,
  before: RatedAnswerCursor | null,
  limit: number,
): Promise<{ answers: RatedAnswer[]; next: string | null; facets: RatedAnswerFacets }> {
  const args = rpcArgs(filters);
  const [list, facets] = await Promise.all([
    admin.rpc('staff_ai_rated_answers', { ...args, p_before_at: before?.at ?? null, p_before_id: before?.id ?? null, p_limit: limit + 1 }),
    admin.rpc('staff_ai_rated_answer_facets', args),
  ]);
  if (list.error) throw list.error;
  if (facets.error) throw facets.error;
  const rows = ((list.data ?? []) as Row[]).slice(0, limit);
  await recordAccess(admin, caller, 'ai_feedback.answers.view', filters, rows);
  const last = rows[rows.length - 1];
  const f = (facets.data ?? {}) as Row;
  return {
    answers: rows.map(toAnswer),
    next: ((list.data ?? []) as Row[]).length > limit && last ? `${last.answered_at}|${last.message_id}` : null,
    facets: { total: Number(f.total ?? 0), usability: nums(f.usability, 5), comments: Number(f.comments ?? 0) },
  };
}

const EXPORT_MAX = 10_000;

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Every rated answer matching the filters as CSV (participant ID, never the patient's name).
 * Recorded in audit_log before it is returned.
 */
export async function exportRatedAnswers(admin: SupabaseClient, caller: StaffCaller, filters: RatedAnswerFilters): Promise<string> {
  const args = rpcArgs(filters);
  const rows: Row[] = [];
  let before: RatedAnswerCursor | null = null;
  while (rows.length < EXPORT_MAX) {
    const { data, error } = await admin.rpc('staff_ai_rated_answers', {
      ...args,
      p_before_at: before?.at ?? null,
      p_before_id: before?.id ?? null,
      p_limit: 500,
    });
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 500) break;
    const last = page[page.length - 1];
    before = { at: last.answered_at as string, id: last.message_id as string };
  }
  await recordAccess(admin, caller, 'ai_feedback.answers.export', filters, rows);
  const header = [
    'Answered at (UTC)', 'Participant', 'Language', 'Model', 'Usability (1-5)', 'Safety (1-3)', 'Comment',
    'Question', 'Answer', 'Conversation ID', 'Answer ID',
  ];
  const lines = rows.map(toAnswer).map((a) => [
    a.answeredAt, a.participant ?? '', a.language, a.model, a.usability ?? '', a.safety ?? '', a.comment ?? '',
    a.question, a.answer, a.conversationId, a.messageId,
  ]);
  return '﻿' + [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
