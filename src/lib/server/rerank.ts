import 'server-only';

/**
 * Rerank via an OpenAI-compatible /reranks API (Alibaba Cloud Model Studio,
 * qwen3.7-text-rerank by default). Uses DASHSCOPE_API_KEY. Server-only.
 */

export interface RerankHit {
  /** Index into the documents that were sent. */
  index: number;
  score: number;
}

/** Inputs longer than this are cut (the API rejects, rather than truncates, over-long inputs). */
const MAX_DOC_CHARS = 6000;

export function rerankModel(): string | null {
  return process.env.DASHSCOPE_API_KEY && process.env.RERANK_MODEL ? process.env.RERANK_MODEL : null;
}

export async function rerank(query: string, documents: string[], topN: number): Promise<RerankHit[]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const model = process.env.RERANK_MODEL;
  if (!apiKey || !model) throw new Error('Rerank is not configured (DASHSCOPE_API_KEY / RERANK_MODEL missing on the server).');
  if (!documents.length) return [];
  const baseUrl = (process.env.RERANK_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-api/v1').replace(/\/+$/, '');

  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/reranks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          query,
          documents: documents.map((d) => d.slice(0, MAX_DOC_CHARS)),
          top_n: Math.min(topN, documents.length),
        }),
        cache: 'no-store',
      });
    } catch {
      lastError = 'could not reach the rerank service';
      continue;
    }
    const body = (await res.json().catch(() => null)) as
      | { results?: { index: number; relevance_score: number }[]; error?: { message?: string }; message?: string }
      | null;
    if (res.ok && Array.isArray(body?.results)) {
      return body.results
        .filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < documents.length)
        .map((r) => ({ index: r.index, score: Number(r.relevance_score) }))
        .sort((a, b) => b.score - a.score);
    }
    lastError = body?.error?.message || body?.message || `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`Rerank failed: ${lastError}`);
}
