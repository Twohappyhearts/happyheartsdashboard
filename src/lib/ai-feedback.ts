/**
 * AI Feedback (Analytics › AI Feedback and its list of rated answers): types shared by the server
 * (src/lib/server/agent/feedback.ts) and the dashboard, and the dashboard's fetch helpers.
 * Patients rate each answer: usability 1–5 (5 best) and safety 1–3 (3 safe, 2 concern, 1 unsafe).
 */

export const FEEDBACK_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type FeedbackRange = (typeof FEEDBACK_RANGES)[number];

export const FEEDBACK_BUCKETS = ['day', 'week', 'month'] as const;
export type FeedbackBucket = (typeof FEEDBACK_BUCKETS)[number];

export type FeedbackDimension = 'source' | 'model' | 'language';

export interface FeedbackFilters {
  range: FeedbackRange;
  /** Patient's app language code, 'unknown' when not set; null = all. */
  language: string | null;
  /** Model id as stored on the answer, 'unknown' when missing; null = all. */
  model: string | null;
}

export interface RatedAnswerFilters extends FeedbackFilters {
  usability: number | null;
  safety: number | null;
  withComment: boolean;
  search: string;
}

/** Numbers for one group of answers (everything, one day/week/month, one model…). */
export interface FeedbackAggregate {
  answers: number;
  rated: number;
  /** Patients who got an answer. */
  patients: number;
  /** Patients who rated at least one answer. */
  raters: number;
  /** Ratings of the patient who rated the most. */
  topRater: number;
  nUsability: number;
  nSafety: number;
  comments: number;
  /** Per patient when counting by patient. */
  avgUsability: number | null;
  /** Share of usability ratings 4–5. */
  top2Share: number | null;
  avgSafety: number | null;
  /** Scores 1..5. */
  usabilityCount: number[];
  usabilityShare: (number | null)[];
  /** Unsafe, Concern, Safe (scores 1..3). */
  safetyCount: number[];
  safetyShare: (number | null)[];
}

export interface FeedbackGroup extends FeedbackAggregate {
  key: string;
}

export interface FeedbackStats {
  overall: FeedbackAggregate;
  /** Every day/week/month of the range, oldest first; key = its first day (YYYY-MM-DD). */
  buckets: FeedbackGroup[];
  groups: Record<FeedbackDimension, FeedbackGroup[]>;
  options: { languages: string[]; models: string[] };
}

export interface RatedAnswer {
  messageId: string;
  conversationId: string;
  answeredAt: string;
  /** Display ID, else @username. */
  participant: string | null;
  language: string;
  model: string;
  usability: number | null;
  safety: number | null;
  comment: string | null;
  question: string;
  answer: string;
}

export interface RatedAnswerFacets {
  total: number;
  /** Answers with usability 1..5. */
  usability: number[];
  comments: number;
}

export class FeedbackError extends Error {}

/** Query string of the filters (only what differs from the defaults). */
export function feedbackQuery(f: Partial<RatedAnswerFilters>, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.range && f.range !== '30d') p.set('range', f.range);
  if (f.language) p.set('language', f.language);
  if (f.model) p.set('model', f.model);
  if (f.usability) p.set('usability', String(f.usability));
  if (f.safety) p.set('safety', String(f.safety));
  if (f.withComment) p.set('comment', '1');
  if (f.search) p.set('q', f.search);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

/** Filters from a query string (the dashboard URL); anything unknown falls back to the default. */
export function readFeedbackQuery(p: URLSearchParams): RatedAnswerFilters {
  const range = p.get('range') as FeedbackRange;
  const score = (key: string, max: number) => {
    const n = Number(p.get(key));
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  };
  return {
    range: FEEDBACK_RANGES.includes(range) ? range : '30d',
    language: p.get('language') || null,
    model: p.get('model') || null,
    usability: score('usability', 5),
    safety: score('safety', 3),
    withComment: p.get('comment') === '1',
    search: p.get('q') ?? '',
  };
}

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new FeedbackError('Could not reach the server.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new FeedbackError(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

export function getFeedbackStats(filters: FeedbackFilters, by: 'answer' | 'patient', bucket: FeedbackBucket) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return get<FeedbackStats>(`/api/admin/ai-feedback/stats?${feedbackQuery(filters, { by, bucket, tz })}`);
}

export function listRatedAnswers(filters: RatedAnswerFilters, before: string | null) {
  return get<{ answers: RatedAnswer[]; next: string | null; facets: RatedAnswerFacets }>(
    `/api/admin/ai-feedback/answers?${feedbackQuery(filters, before ? { before } : {})}`,
  );
}

/** Download the CSV of every rated answer matching the filters. */
export async function exportRatedAnswers(filters: RatedAnswerFilters): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/ai-feedback/answers/export?${feedbackQuery(filters)}`, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new FeedbackError('Could not reach the server.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new FeedbackError(body?.error ?? `Request failed (${res.status}).`);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'ai-rated-answers.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Answer text for a short preview: markdown marks removed. */
export const plainPreview = (text: string) =>
  text
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(#{1,6}|[-*•]|\d+\.)\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
