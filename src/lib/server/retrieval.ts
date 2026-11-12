import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { embedOne } from './embeddings';
import { rerank, rerankModel } from './rerank';

/**
 * Knowledge retrieval used by the dashboard's test search and (later) the AI agent:
 *
 *   query ─┬─ keyword search (Postgres full-text) → top keywordK ─┐
 *          └─ embed → vector search (pgvector)    → top vectorK  ─┴─ RRF merge → candidates
 *   candidates → rerank (qwen3.7-text-rerank, only when RERANK_MODEL is set) → top topK
 *
 * Degrades instead of failing: if embedding fails it is keyword-only; if rerank
 * fails the RRF order is used. `warnings` says what happened.
 */

export interface RetrievalOptions {
  query: string;
  /** null/empty = all enabled knowledge bases. */
  knowledgeBaseIds?: string[] | null;
  keywordK?: number;
  vectorK?: number;
  /** RRF constant k in 1 / (k + rank). */
  rrfK?: number;
  /** How many fused candidates go to the reranker. */
  candidates?: number;
  topK?: number;
  /** At most this many chunks from one document, so other documents get a place in the top K. */
  maxPerDocument?: number;
  /**
   * A different cap for documents of these knowledge_documents.source_type values, e.g.
   * { resources: 8 } for the generated community resource directory (one document holding many
   * separate entries). Used together with maxPerDocument.
   */
  maxPerDocumentBySourceType?: Record<string, number>;
  rerank?: boolean;
}

export interface RetrievedChunk {
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

export interface RetrievalResult {
  results: RetrievedChunk[];
  candidateCount: number;
  reranked: boolean;
  rerankModel: string | null;
  warnings: string[];
  timings: { embedMs: number; searchMs: number; rerankMs: number; totalMs: number };
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Number(v));

export async function retrieve(admin: SupabaseClient, opts: RetrievalOptions): Promise<RetrievalResult> {
  const t0 = Date.now();
  const keywordK = opts.keywordK ?? 20;
  const vectorK = opts.vectorK ?? 20;
  const topK = opts.topK ?? 5;
  const candidates = Math.max(topK, opts.candidates ?? Math.max(keywordK, vectorK, topK));
  const warnings: string[] = [];

  // 1. Query embedding (vector half is skipped if this fails).
  let embedding: number[] | null = null;
  const tEmbed = Date.now();
  if (vectorK > 0) {
    try {
      embedding = await embedOne(opts.query);
    } catch (e) {
      warnings.push(`Vector search skipped — ${e instanceof Error ? e.message : 'embedding failed'}`);
    }
  }
  const embedMs = Date.now() - tEmbed;

  // 2. Keyword top-N + vector top-N, fused with RRF (one SQL function).
  const tSearch = Date.now();
  const { data, error } = await admin.rpc('knowledge_hybrid_search', {
    p_query: opts.query,
    p_embedding: embedding,
    p_knowledge_base_ids: opts.knowledgeBaseIds?.length ? opts.knowledgeBaseIds : null,
    p_keyword_k: keywordK,
    p_vector_k: embedding ? vectorK : 0,
    p_rrf_k: opts.rrfK ?? 60,
    p_limit: candidates,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  const searchMs = Date.now() - tSearch;

  const fused: RetrievedChunk[] = ((data as Row[] | null) ?? []).map((r, i) => {
    const m = (r.metadata ?? {}) as Row;
    return {
      chunkId: String(r.chunk_id),
      documentId: String(r.document_id),
      knowledgeBaseId: String(r.knowledge_base_id),
      title: String(r.title ?? ''),
      chunkIndex: Number(r.chunk_index ?? 0),
      content: String(r.content ?? ''),
      searchText: String(r.search_text ?? r.content ?? ''),
      outlinePath: Array.isArray(m.outline_path) ? m.outline_path.map(String) : [],
      assets: Array.isArray(m.assets) ? m.assets.map(String) : [],
      keywordRank: num(r.keyword_rank),
      keywordScore: num(r.keyword_score),
      vectorRank: num(r.vector_rank),
      vectorSimilarity: num(r.vector_similarity),
      rrfRank: i + 1,
      rrfScore: Number(r.rrf_score ?? 0),
      rerankScore: null,
    };
  });

  // 3. Rerank the fused candidates, keep top K (capped per document).
  const limitFor = await perDocumentLimits(admin, fused, opts, warnings);
  const keep = (ordered: RetrievedChunk[]) => capPerDocument(ordered, limitFor).slice(0, topK);
  let results = keep(fused);
  let reranked = false;
  const tRerank = Date.now();
  if (opts.rerank !== false && rerankModel() && fused.length > 0) {
    try {
      const hits = await rerank(opts.query, fused.map((c) => c.searchText), opts.maxPerDocument ? fused.length : topK);
      results = keep(hits.map((h) => ({ ...fused[h.index], rerankScore: h.score })));
      reranked = true;
    } catch (e) {
      warnings.push(`Rerank skipped, showing RRF order — ${e instanceof Error ? e.message : 'rerank failed'}`);
    }
  }
  const rerankMs = Date.now() - tRerank;

  return {
    results,
    candidateCount: fused.length,
    reranked,
    rerankModel: reranked ? rerankModel() : null,
    warnings,
    timings: { embedMs, searchMs, rerankMs, totalMs: Date.now() - t0 },
  };
}

/** The per-document cap for each candidate's document (null = no cap). */
async function perDocumentLimits(
  admin: SupabaseClient,
  fused: RetrievedChunk[],
  opts: RetrievalOptions,
  warnings: string[],
): Promise<((documentId: string) => number) | null> {
  const base = opts.maxPerDocument;
  if (!base) return null;
  const special = opts.maxPerDocumentBySourceType ?? {};
  if (!Object.keys(special).length || !fused.length) return () => base;
  const ids = Array.from(new Set(fused.map((c) => c.documentId)));
  const { data, error } = await admin.from('knowledge_documents').select('id, source_type').in('id', ids);
  if (error) {
    warnings.push(`Per-document limits by source type skipped — ${error.message}`);
    return () => base;
  }
  const byDocument = new Map<string, number>();
  for (const d of (data as Row[] | null) ?? []) {
    const limit = special[String(d.source_type)];
    if (limit) byDocument.set(String(d.id), limit);
  }
  return (documentId) => byDocument.get(documentId) ?? base;
}

function capPerDocument(ordered: RetrievedChunk[], limitFor: ((documentId: string) => number) | null): RetrievedChunk[] {
  if (!limitFor) return ordered;
  const seen = new Map<string, number>();
  return ordered.filter((c) => {
    const n = (seen.get(c.documentId) ?? 0) + 1;
    seen.set(c.documentId, n);
    return n <= limitFor(c.documentId);
  });
}
