import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/**
 * The community resource directory (public.community_resources), on the Content page's
 * Community Resources tab. The AI assistant does not read this table: the dashboard server
 * summarizes each resource's website ("Update from websites") and publishes the whole directory
 * as one generated knowledge-base document ("Publish to knowledge base").
 *
 * Staff read and write the table directly (RLS: active staff only); the ai_* columns are written
 * by the server. Shared by server and client, so no server-only imports here.
 */

/** Category codes (database CHECK). Display names: staff text `resources.categories`. */
export const RESOURCE_CATEGORIES = [
  'emergency_211',
  'food_diapers',
  'mental_health',
  'pregnancy_postpartum',
  'parenting',
  'child_health',
  'breastfeeding',
  'domestic_violence',
  'housing',
  'financial',
  'technology',
  'wellness',
  'doula',
  'childbirth_classes',
  'child_care',
  'other',
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
export const isResourceCategory = (v: unknown): v is ResourceCategory =>
  typeof v === 'string' && (RESOURCE_CATEGORIES as readonly string[]).includes(v);

export type ResourceAiStatus = 'ok' | 'failed' | 'no_website' | 'pending';

/** Same limits as the database CHECKs. */
export const RESOURCE_LIMITS = {
  name: 200,
  description: 2000,
  phone: 300,
  textNumber: 300,
  website: 2000,
  address: 1000,
  areaServed: 300,
  eligibility: 2000,
  source: 200,
} as const;

/** A full http(s) link (the database accepts the same). */
export const WEBSITE_RE = /^https?:\/\/[^\s/?#]+\S*$/i;

/** Token use of one AI summary (community_resources.ai_usage). */
export interface ResourceAiUsage {
  runId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolCalls: number;
  at: string;
}

export interface CommunityResource {
  id: string;
  name: string;
  category: ResourceCategory;
  description: string;
  phone: string;
  textNumber: string;
  website: string;
  address: string;
  areaServed: string;
  /** null = not known. */
  isFree: boolean | null;
  eligibility: string;
  /** yyyy-mm-dd or null. */
  lastVerifiedOn: string | null;
  active: boolean;
  source: string;
  aiSummary: string;
  aiFetchedAt: string | null;
  aiStatus: ResourceAiStatus;
  aiError: string;
  /** The website the summary was written from. */
  aiSourceUrl: string;
  aiUsage: ResourceAiUsage | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields staff fill in (the rest is written by the server or the database). */
export type ResourceInput = Pick<
  CommunityResource,
  | 'name'
  | 'category'
  | 'description'
  | 'phone'
  | 'textNumber'
  | 'website'
  | 'address'
  | 'areaServed'
  | 'isFree'
  | 'eligibility'
  | 'lastVerifiedOn'
  | 'active'
  | 'source'
>;

/** A summary counts only while the website is still the one it was written from. */
export const hasCurrentSummary = (r: Pick<CommunityResource, 'aiStatus' | 'aiSummary' | 'aiSourceUrl' | 'website'>) =>
  r.aiStatus === 'ok' && !!r.aiSummary.trim() && r.aiSourceUrl === r.website;

/** Re-check a website after this long. */
export const SUMMARY_MAX_AGE_DAYS = 30;

/**
 * Resources "Update from websites" works on: active, with a website, and never summarized,
 * website changed since, failed last time, or summarized more than 30 days ago.
 */
export function needsWebsiteCheck(
  r: Pick<CommunityResource, 'active' | 'website' | 'aiStatus' | 'aiFetchedAt' | 'aiSourceUrl'>,
  now = Date.now(),
): boolean {
  if (!r.active || !r.website) return false;
  if (r.aiStatus !== 'ok' || !r.aiFetchedAt || r.aiSourceUrl !== r.website) return true;
  return now - new Date(r.aiFetchedAt).getTime() > SUMMARY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export class ResourceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;

export const RESOURCE_COLUMNS =
  'id, name, category, description, phone, text_number, website, address, area_served, is_free, eligibility, ' +
  'last_verified_on, is_active, source, ai_summary, ai_fetched_at, ai_status, ai_error, ai_source_url, ai_usage, ' +
  'created_at, updated_at';

const str = (v: unknown) => (v == null ? '' : String(v));
const AI_STATUSES: ResourceAiStatus[] = ['ok', 'failed', 'no_website', 'pending'];

export function toResource(r: Row): CommunityResource {
  const status = AI_STATUSES.includes(r.ai_status as ResourceAiStatus) ? (r.ai_status as ResourceAiStatus) : 'pending';
  const usage = r.ai_usage && typeof r.ai_usage === 'object' && !Array.isArray(r.ai_usage) ? (r.ai_usage as ResourceAiUsage) : null;
  return {
    id: String(r.id),
    name: str(r.name),
    category: isResourceCategory(r.category) ? r.category : 'other',
    description: str(r.description),
    phone: str(r.phone),
    textNumber: str(r.text_number),
    website: str(r.website),
    address: str(r.address),
    areaServed: str(r.area_served),
    isFree: typeof r.is_free === 'boolean' ? r.is_free : null,
    eligibility: str(r.eligibility),
    lastVerifiedOn: r.last_verified_on ? String(r.last_verified_on).slice(0, 10) : null,
    active: r.is_active === true,
    source: str(r.source),
    aiSummary: str(r.ai_summary),
    aiFetchedAt: (r.ai_fetched_at as string | null) ?? null,
    aiStatus: status,
    aiError: str(r.ai_error),
    aiSourceUrl: str(r.ai_source_url),
    aiUsage: usage,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

const blankToNull = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/** Problems with the input, by field; empty when it can be saved. Messages in the dashboard language. */
export function validateResource(input: ResourceInput): Partial<Record<keyof ResourceInput, string>> {
  const T = staffText().resources.form;
  const out: Partial<Record<keyof ResourceInput, string>> = {};
  const tooLong = (field: keyof typeof RESOURCE_LIMITS & keyof ResourceInput, value: string) => {
    if (value.trim().length > RESOURCE_LIMITS[field]) out[field] = T.maxChars(RESOURCE_LIMITS[field]);
  };
  if (!input.name.trim()) out.name = T.nameRequired;
  tooLong('name', input.name);
  if (!isResourceCategory(input.category)) out.category = T.categoryRequired;
  tooLong('description', input.description);
  tooLong('phone', input.phone);
  tooLong('textNumber', input.textNumber);
  const site = input.website.trim();
  if (site && !WEBSITE_RE.test(site)) out.website = T.websiteInvalid;
  tooLong('website', input.website);
  tooLong('address', input.address);
  tooLong('areaServed', input.areaServed);
  tooLong('eligibility', input.eligibility);
  tooLong('source', input.source);
  if (input.lastVerifiedOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.lastVerifiedOn)) out.lastVerifiedOn = T.dateInvalid;
  return out;
}

/** Database row from staff input (only the columns staff may write). */
export function resourceRow(input: ResourceInput): Row {
  return {
    name: input.name.trim(),
    category: input.category,
    description: blankToNull(input.description),
    phone: blankToNull(input.phone),
    text_number: blankToNull(input.textNumber),
    website: blankToNull(input.website),
    address: blankToNull(input.address),
    area_served: blankToNull(input.areaServed),
    is_free: input.isFree,
    eligibility: blankToNull(input.eligibility),
    last_verified_on: input.lastVerifiedOn || null,
    is_active: input.active,
    source: blankToNull(input.source),
  };
}

const E = () => staffText().resources.errors;

function fail(e: { code?: string; message?: string } | null, fallback: string): ResourceError {
  if (!e) return new ResourceError(fallback);
  if (e.code === '42501') return new ResourceError(staffText().common.noStaffPermission, e.code);
  if (e.code === '23505') return new ResourceError(E().duplicate, e.code);
  if (e.code === '23514' || e.code === '22001' || e.code === '22007' || e.code === '22008') return new ResourceError(E().invalid, e.code);
  if (e.code === 'PGRST205' || e.code === '42P01') return new ResourceError(E().missingTable, e.code);
  return new ResourceError(`${fallback}${e.message ? `: ${e.message}` : ''}`, e.code);
}

export async function listResources(supabase: SupabaseClient): Promise<CommunityResource[]> {
  const { data, error } = await supabase.from('community_resources').select(RESOURCE_COLUMNS).order('name');
  if (error) throw fail(error, E().load);
  return ((data ?? []) as unknown as Row[]).map(toResource);
}

export async function createResource(supabase: SupabaseClient, input: ResourceInput): Promise<CommunityResource> {
  const { data, error } = await supabase.from('community_resources').insert(resourceRow(input)).select(RESOURCE_COLUMNS).single();
  if (error) throw fail(error, E().create);
  return toResource(data as unknown as Row);
}

export async function updateResource(supabase: SupabaseClient, id: string, input: ResourceInput): Promise<CommunityResource> {
  const { data, error } = await supabase
    .from('community_resources')
    .update(resourceRow(input))
    .eq('id', id)
    .select(RESOURCE_COLUMNS)
    .maybeSingle();
  if (error) throw fail(error, E().save);
  if (!data) throw new ResourceError(E().gone);
  return toResource(data as unknown as Row);
}

export async function setResourceActive(supabase: SupabaseClient, id: string, active: boolean): Promise<CommunityResource> {
  const { data, error } = await supabase
    .from('community_resources')
    .update({ is_active: active })
    .eq('id', id)
    .select(RESOURCE_COLUMNS)
    .maybeSingle();
  if (error) throw fail(error, E().save);
  if (!data) throw new ResourceError(E().gone);
  return toResource(data as unknown as Row);
}

export async function deleteResource(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('community_resources').delete().eq('id', id);
  if (error) throw fail(error, E().remove);
}

// ---- Runs ("Update from websites", "Publish to knowledge base") ------------------------------

export type ResourceRunKind = 'fetch' | 'publish';

/** Token totals of a run (community_resource_runs.usage). */
export interface ResourceRunUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolCalls: number;
  modelCalls: number;
  /** Model id → number of calls. */
  models: Record<string, number>;
}

export const emptyRunUsage = (): ResourceRunUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  toolCalls: 0,
  modelCalls: 0,
  models: {},
});

export interface ResourceRun {
  id: string;
  kind: ResourceRunKind;
  status: 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  okCount: number;
  failedCount: number;
  usage: ResourceRunUsage;
  result: Record<string, unknown>;
  error: string;
  startedAt: string;
  heartbeatAt: string;
  finishedAt: string | null;
}

/** A running run that has not reported for this long has died (server restart); a new one may start. */
export const RUN_STALE_MS = 3 * 60 * 1000;

export const isStaleRun = (run: Pick<ResourceRun, 'status' | 'heartbeatAt'>, now = Date.now()) =>
  run.status === 'running' && now - new Date(run.heartbeatAt).getTime() > RUN_STALE_MS;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toRun(r: Row): ResourceRun {
  const u = (r.usage && typeof r.usage === 'object' ? r.usage : {}) as Row;
  return {
    id: String(r.id),
    kind: r.kind === 'publish' ? 'publish' : 'fetch',
    status: r.status === 'done' || r.status === 'failed' ? r.status : 'running',
    total: num(r.total),
    processed: num(r.processed),
    okCount: num(r.ok_count),
    failedCount: num(r.failed_count),
    usage: {
      inputTokens: num(u.inputTokens),
      cachedInputTokens: num(u.cachedInputTokens),
      outputTokens: num(u.outputTokens),
      reasoningTokens: num(u.reasoningTokens),
      toolCalls: num(u.toolCalls),
      modelCalls: num(u.modelCalls),
      models: u.models && typeof u.models === 'object' ? (u.models as Record<string, number>) : {},
    },
    result: r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : {},
    error: str(r.error),
    startedAt: str(r.started_at),
    heartbeatAt: str(r.heartbeat_at),
    finishedAt: (r.finished_at as string | null) ?? null,
  };
}

export const RUN_COLUMNS =
  'id, kind, status, total, processed, ok_count, failed_count, usage, result, error, started_at, heartbeat_at, finished_at';

/** The latest run of each kind (null when there was none). */
export async function latestRuns(supabase: SupabaseClient): Promise<Record<ResourceRunKind, ResourceRun | null>> {
  const one = async (kind: ResourceRunKind) => {
    const { data, error } = await supabase
      .from('community_resource_runs')
      .select(RUN_COLUMNS)
      .eq('kind', kind)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw fail(error, E().load);
    return data ? toRun(data as unknown as Row) : null;
  };
  const [fetchRun, publishRun] = await Promise.all([one('fetch'), one('publish')]);
  return { fetch: fetchRun, publish: publishRun };
}

// ---- Dashboard API (src/app/api/admin/community-resources) ------------------------------------

export interface ArticleEntryProblem {
  id: string;
  name: string;
  category: ResourceCategory;
  website: string;
  error: string;
}

export interface ArticlePreview {
  title: string;
  markdown: string;
  /** Sent back with Publish: the server refuses if the directory changed since. */
  hash: string;
  entryCount: number;
  withSummary: number;
  /** Website check failed: in the article without a summary. */
  failed: ArticleEntryProblem[];
  /** Has a website that was never checked (or changed since). */
  pending: ArticleEntryProblem[];
  published: { documentId: string; publishedAt: string | null; chunkCount: number; status: string; sameAsPreview: boolean } | null;
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new ResourceError(staffText().common.networkError);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ResourceError(data?.error || staffText().common.requestFailed(res.status));
  return data as T;
}

export const startWebsiteUpdate = () =>
  api<{ runId: string; total: number }>('/api/admin/community-resources/fetch', { method: 'POST' });

export const previewArticle = () => api<ArticlePreview>('/api/admin/community-resources/article', { cache: 'no-store' });

export const publishArticle = (hash: string) =>
  api<{ runId: string }>('/api/admin/community-resources/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash }),
  });
