import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/** Dashboard side of the AI knowledge base (reads via RLS, writes via /api/admin/knowledge). */

/**
 * A "Chunk" job: uploaded/parsed → parsing (MinerU / built-in → Markdown) → processing (chunk + embed) → ready.
 * The job is all or nothing: if it fails, the document goes back to its previous status
 * (keeping any previous chunks) and `error` says what went wrong.
 * 'failed' only appears on documents from before this rule.
 */
export type KnowledgeStatus = 'uploaded' | 'parsing' | 'parsed' | 'processing' | 'ready' | 'failed';

export interface ChunkSettings {
  targetChars: number;
  overlapChars: number;
  /** A whole section / table / list / code block may grow to targetChars × this before it is split. */
  toleranceFactor: number;
}

/** Keep in sync with lib/server/rag/budget.ts. */
export const DEFAULT_CHUNK_SETTINGS: ChunkSettings = { targetChars: 1024, overlapChars: 128, toleranceFactor: 3 };
export const CHUNK_TARGET_RANGE = { min: 200, max: 8192 } as const;
export const TOLERANCE_RANGE = { min: 1, max: 8 } as const;
/** toleranceChars = min(targetChars × toleranceFactor, 8192) */
export const toleranceChars = (s: ChunkSettings) => Math.min(s.targetChars * s.toleranceFactor, CHUNK_TARGET_RANGE.max);

export interface JobProgress {
  phase: 'parsing' | 'chunking' | 'embedding' | string;
  done: number | null;
  total: number | null;
}

export interface ParseProgress {
  state: string;
  extractedPages: number | null;
  totalPages: number | null;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  description: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: KnowledgeStatus;
  error: string | null;
  pageCount: number | null;
  charCount: number | null;
  chunkCount: number;
  active: boolean;
  createdAt: string;
  /** Settings used for the current chunks (null until chunked). */
  chunkSettings: ChunkSettings | null;
  processedAt: string | null;
  /** 'mineru' | 'builtin' once parsing started. */
  parser: string | null;
  parseProgress: ParseProgress | null;
  /** Parsed Markdown exists (re-chunking won't need MinerU again). */
  hasParsed: boolean;
  parsedAt: string | null;
  jobProgress: JobProgress | null;
  /** Committed set of chunks (null = never chunked). */
  chunkGeneration: string | null;
  embeddingModel: string | null;
  updatedAt: string;
  uploaderUsername: string | null;
}

export interface KnowledgeChunk {
  id: string;
  index: number;
  /** Markdown / HTML-table text as shown to the model. */
  content: string;
  /** Text used for search (and embeddings later): section path + body, tables as "column: value". */
  embeddingText: string | null;
  tokenCount: number;
  outlinePath: string[];
  /** Storage paths (or URLs) of images in this chunk. */
  assets: string[];
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
}

export interface KeywordHit {
  chunkId: string;
  documentId: string;
  title: string;
  index: number;
  content: string;
  pageStart: number | null;
  rank: number;
}

export class KnowledgeError extends Error {}

type Row = Record<string, unknown>;

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md'];
export const MAX_UPLOAD_MB = 50;

// ---------------------------------------------------------------------------
// Knowledge bases

export interface KnowledgeBase {
  id: string;
  name: string;
  /** Stable id the AI agent uses (lowercase, underscores). */
  slug: string;
  description: string;
  embeddingModel: string | null;
  chunkSettings: ChunkSettings;
  active: boolean;
  ownerUsername: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  notChunkedCount: number;
  chunkCount: number;
}

export const KB_SLUG_RE = /^[a-z][a-z0-9_]{1,49}$/;

/** Suggest an ID from a name ("Patient Education" → "patient_education"). */
export function suggestSlug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 50);
  return s;
}

export async function listKnowledgeBases(supabase: SupabaseClient): Promise<KnowledgeBase[]> {
  const { data, error } = await supabase.rpc('knowledge_base_list');
  if (error) {
    if (error.code === 'PGRST202') throw new KnowledgeError(staffText().kb.lib.runKbMigration);
    throw new KnowledgeError(error.message || staffText().kb.lib.loadBases);
  }
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    slug: String(r.slug ?? ''),
    description: String(r.description ?? ''),
    embeddingModel: (r.embedding_model as string | null) ?? null,
    chunkSettings: {
      targetChars: Number(r.chunk_target_chars ?? DEFAULT_CHUNK_SETTINGS.targetChars),
      overlapChars: Number(r.chunk_overlap_chars ?? DEFAULT_CHUNK_SETTINGS.overlapChars),
      toleranceFactor: Number(r.chunk_tolerance_factor ?? DEFAULT_CHUNK_SETTINGS.toleranceFactor),
    },
    active: Boolean(r.is_active),
    ownerUsername: (r.owner_username as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
    documentCount: Number(r.document_count ?? 0),
    notChunkedCount: Number(r.not_chunked_count ?? 0),
    chunkCount: Number(r.chunk_count ?? 0),
  }));
}

export async function getKnowledgeBase(supabase: SupabaseClient, id: string): Promise<KnowledgeBase | null> {
  return (await listKnowledgeBases(supabase)).find((kb) => kb.id === id) ?? null;
}

export interface KnowledgeBaseInput {
  name: string;
  description: string;
  chunkTargetChars: number;
  chunkOverlapChars: number;
  chunkToleranceFactor: number;
}

export function createKnowledgeBase(input: KnowledgeBaseInput & { slug: string }) {
  return api<{ id: string }>('/api/admin/knowledge-bases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateKnowledgeBase(id: string, changes: Partial<KnowledgeBaseInput> & { isActive?: boolean }) {
  return api<{ ok: true }>(`/api/admin/knowledge-bases/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export function deleteKnowledgeBase(id: string) {
  return api<{ ok: true; deletedDocuments: number }>(`/api/admin/knowledge-bases/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Documents

export async function listDocuments(supabase: SupabaseClient, knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, title, description, file_name, mime_type, size_bytes, status, error, page_count, char_count, chunk_count, is_active, created_at, updated_at, uploaded_by, chunk_settings, processed_at, parser, parse_progress, parsed_path, parsed_at, job_progress, chunk_generation, embedding_model')
    .eq('knowledge_base_id', knowledgeBaseId)
    // Uploaded files and the generated community resource directory (lesson copies are not listed).
    .in('source_type', ['upload', 'resources'])
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') throw new KnowledgeError(staffText().kb.lib.runDocMigration);
    throw new KnowledgeError(error.message || staffText().kb.lib.loadDocuments);
  }
  const rows = (data as Row[] | null) ?? [];
  // Uploader usernames (best effort — the list still works without them).
  const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by).filter((v): v is string => typeof v === 'string'))];
  const usernames = new Map<string, string>();
  if (uploaderIds.length) {
    const { data: people } = await supabase.from('profiles').select('id, username').in('id', uploaderIds);
    for (const p of (people as Row[] | null) ?? []) usernames.set(String(p.id), String(p.username ?? ''));
  }
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    fileName: String(r.file_name ?? ''),
    mimeType: String(r.mime_type ?? ''),
    sizeBytes: Number(r.size_bytes ?? 0),
    status: (r.status as KnowledgeStatus) ?? 'uploaded',
    error: (r.error as string | null) ?? null,
    pageCount: r.page_count == null ? null : Number(r.page_count),
    charCount: r.char_count == null ? null : Number(r.char_count),
    chunkCount: Number(r.chunk_count ?? 0),
    active: Boolean(r.is_active),
    createdAt: String(r.created_at ?? ''),
    chunkSettings: parseSettings(r.chunk_settings),
    processedAt: (r.processed_at as string | null) ?? null,
    parser: (r.parser as string | null) ?? null,
    parseProgress: parseProgress(r.parse_progress),
    hasParsed: !!r.parsed_path,
    parsedAt: (r.parsed_at as string | null) ?? null,
    jobProgress: jobProgress(r.job_progress),
    chunkGeneration: (r.chunk_generation as string | null) ?? null,
    embeddingModel: (r.embedding_model as string | null) ?? null,
    updatedAt: String(r.updated_at ?? r.created_at ?? ''),
    uploaderUsername: typeof r.uploaded_by === 'string' ? usernames.get(r.uploaded_by) || null : null,
  }));
}

/** "just now", "42 min ago", "3 h ago", else a short date (in the dashboard language). */
export function fmtRelative(iso: string, locale = 'en-US'): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const T = staffText().kb.lib;
  if (diff < 60_000) return T.justNow;
  if (diff < 3_600_000) return T.minutesAgo(Math.floor(diff / 60_000));
  if (diff < 86_400_000) return T.hoursAgo(Math.floor(diff / 3_600_000));
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function parseSettings(raw: unknown): ChunkSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const t = Number(o.target_chars);
  const v = Number(o.overlap_chars);
  // Documents chunked before the tolerance setting existed were effectively ×1.
  const f = o.tolerance_factor == null ? 1 : Number(o.tolerance_factor);
  return Number.isFinite(t) && Number.isFinite(v) ? { targetChars: t, overlapChars: v, toleranceFactor: f } : null;
}

function jobProgress(raw: unknown): JobProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    phase: String(o.phase ?? ''),
    done: typeof o.done === 'number' ? o.done : null,
    total: typeof o.total === 'number' ? o.total : null,
  };
}

function parseProgress(raw: unknown): ParseProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    state: String(o.state ?? ''),
    extractedPages: typeof o.extracted_pages === 'number' ? o.extracted_pages : null,
    totalPages: typeof o.total_pages === 'number' ? o.total_pages : null,
  };
}

/** The committed chunks of a document (rows of an unfinished job are skipped). */
export async function listChunks(supabase: SupabaseClient, documentId: string, generation: string | null): Promise<KnowledgeChunk[]> {
  if (!generation) return [];
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('id, chunk_index, content, embedding_text, token_count, metadata')
    .eq('document_id', documentId)
    .eq('generation', generation)
    .order('chunk_index')
    .limit(2000);
  if (error) throw new KnowledgeError(error.message || staffText().kb.lib.loadChunks);
  return ((data as Row[] | null) ?? []).map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      index: Number(r.chunk_index ?? 0),
      content: String(r.content ?? ''),
      embeddingText: (r.embedding_text as string | null) ?? null,
      tokenCount: Number(r.token_count ?? 0),
      outlinePath: Array.isArray(m.outline_path) ? m.outline_path.map(String) : [],
      assets: Array.isArray(m.assets) ? m.assets.map(String) : [],
      pageStart: typeof m.page_start === 'number' ? m.page_start : null,
      pageEnd: typeof m.page_end === 'number' ? m.page_end : null,
      heading: typeof m.heading === 'string' ? m.heading : null,
    };
  });
}

export async function keywordSearch(
  supabase: SupabaseClient,
  query: string,
  knowledgeBaseId: string | null = null,
  limit = 8,
): Promise<KeywordHit[]> {
  const { data, error } = await supabase.rpc('knowledge_search_keyword', {
    p_query: query,
    p_knowledge_base_id: knowledgeBaseId,
    p_limit: limit,
  });
  if (error) throw new KnowledgeError(error.message || staffText().kb.lib.searchFailed);
  return ((data as Row[] | null) ?? []).map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      chunkId: String(r.chunk_id),
      documentId: String(r.document_id),
      title: String(r.title ?? ''),
      index: Number(r.chunk_index ?? 0),
      content: String(r.content ?? ''),
      pageStart: typeof m.page_start === 'number' ? m.page_start : null,
      rank: Number(r.rank ?? 0),
    };
  });
}

async function api<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new KnowledgeError(staffText().common.networkError);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new KnowledgeError(data?.error || staffText().common.requestFailed(res.status));
  return data as T;
}

export function uploadDocument(file: File, knowledgeBaseId: string, title = '', description = '') {
  const form = new FormData();
  form.append('knowledgeBaseId', knowledgeBaseId);
  form.append('file', file);
  if (title) form.append('title', title);
  if (description) form.append('description', description);
  return api<{ id: string; status: KnowledgeStatus }>('/api/admin/knowledge', {
    method: 'POST',
    body: form,
  });
}

export function updateDocument(id: string, changes: { title?: string; description?: string; isActive?: boolean }) {
  return api<{ ok: true }>(`/api/admin/knowledge/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export function deleteDocument(id: string) {
  return api<{ ok: true }>(`/api/admin/knowledge/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface ChunkJobResult {
  ok: boolean;
  /** 'ready' when done; 'parsing' when MinerU is still working (the job continues by itself). */
  status: KnowledgeStatus | string;
  chunkCount: number;
  error?: string;
}

/** Run the Chunk job: parse if needed (or when reparse) → chunk → embed → commit. All or nothing. */
export function chunkDocument(id: string, settings: ChunkSettings = DEFAULT_CHUNK_SETTINGS, reparse = false) {
  return api<ChunkJobResult>(`/api/admin/knowledge/${encodeURIComponent(id)}/chunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...settings, reparse }),
  });
}

/** Ask the server to check MinerU for documents that are still parsing. */
export function refreshParsing(ids: string[]) {
  return api<{ ok: true }>('/api/admin/knowledge/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids.slice(0, 20) }),
  });
}

export const fileUrl = (id: string, variant: 'original' | 'parsed' = 'original') =>
  `/api/admin/knowledge/${encodeURIComponent(id)}/file${variant === 'parsed' ? '?variant=parsed' : ''}`;

/** Image src in a chunk ("assets/x.jpg" or a stored path / URL) → a URL the browser can load. */
export function assetUrl(documentId: string, src: string): string | null {
  if (/^https?:\/\//i.test(src)) return src;
  const name = src.split('/').pop() ?? '';
  if (!/^[\w.\-]{1,200}$/.test(name)) return null;
  return `/api/admin/knowledge/${encodeURIComponent(documentId)}/asset?name=${encodeURIComponent(name)}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Hybrid search (keyword + vector → RRF → rerank)

export interface SearchHit {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  chunkIndex: number;
  content: string;
  searchText: string;
  outlinePath: string[];
  assets: string[];
  keywordRank: number | null;
  keywordScore: number | null;
  vectorRank: number | null;
  vectorSimilarity: number | null;
  rrfRank: number;
  rrfScore: number;
  rerankScore: number | null;
}

export interface SearchResult {
  results: SearchHit[];
  candidateCount: number;
  reranked: boolean;
  rerankModel: string | null;
  warnings: string[];
  timings: { embedMs: number; searchMs: number; rerankMs: number; totalMs: number };
}

export interface SearchParams {
  query: string;
  knowledgeBaseId?: string | null;
  keywordK?: number;
  vectorK?: number;
  candidates?: number;
  topK?: number;
  rerank?: boolean;
}

export function hybridSearch(params: SearchParams) {
  return api<SearchResult>('/api/admin/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}
