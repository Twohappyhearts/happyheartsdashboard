import 'server-only';

/**
 * Text embeddings via an OpenAI-compatible /embeddings API: OpenAI by default
 * (EMBEDDING_PROVIDER=openai), or Alibaba Cloud Model Studio / DashScope
 * (EMBEDDING_PROVIDER=dashscope). Server-only: the API key never reaches the browser.
 * Changing the provider or model means re-chunking every document: vectors from
 * different models can't be compared.
 */

/** Must match knowledge_chunks.embedding vector(1024). */
export const DB_EMBEDDING_DIMENSIONS = 1024;
const BATCH_SIZE = 20; // DashScope accepts up to 25 inputs per request (OpenAI allows more)
const PARALLEL_REQUESTS = 3;
const MAX_RETRIES = 3;

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
}

const PROVIDERS = {
  openai: { keyVar: 'OPENAI_API_KEY', baseUrlVar: 'OPENAI_BASE_URL', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
  dashscope: {
    keyVar: 'DASHSCOPE_API_KEY',
    baseUrlVar: 'DASHSCOPE_BASE_URL',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.7-text-embedding-flash',
  },
} as const;

export function embeddingConfig(): EmbeddingConfig {
  const name = (process.env.EMBEDDING_PROVIDER || 'openai') as keyof typeof PROVIDERS;
  const provider = PROVIDERS[name];
  if (!provider) throw new Error('EMBEDDING_PROVIDER must be "openai" or "dashscope".');
  const apiKey = process.env[provider.keyVar];
  if (!apiKey) throw new Error(`Embeddings are not configured (${provider.keyVar} missing on the server).`);
  const model = process.env.EMBEDDING_MODEL || provider.model;
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || DB_EMBEDDING_DIMENSIONS);
  if (dimensions !== DB_EMBEDDING_DIMENSIONS) {
    throw new Error(`EMBEDDING_DIMENSIONS is ${dimensions}, but the database stores ${DB_EMBEDDING_DIMENSIONS}-dimension vectors.`);
  }
  return {
    baseUrl: (process.env[provider.baseUrlVar] || provider.baseUrl).replace(/\/+$/, ''),
    apiKey,
    model,
    dimensions,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(cfg: EmbeddingConfig, inputs: string[]): Promise<number[][]> {
  let lastError = 'unknown error';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt) await sleep(800 * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, input: inputs, dimensions: cfg.dimensions, encoding_format: 'float' }),
        cache: 'no-store',
      });
    } catch {
      lastError = 'could not reach the embedding service';
      continue;
    }
    const body = (await res.json().catch(() => null)) as
      | { data?: { index: number; embedding: number[] }[]; error?: { message?: string; code?: string } }
      | null;
    if (res.ok && body?.data) {
      const vectors = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      if (vectors.length !== inputs.length) throw new Error(`Embedding service returned ${vectors.length} vectors for ${inputs.length} inputs.`);
      for (const v of vectors) {
        if (!Array.isArray(v) || v.length !== cfg.dimensions || v.some((x) => !Number.isFinite(x))) {
          throw new Error(`Embedding service returned a vector of the wrong size (expected ${cfg.dimensions}).`);
        }
      }
      return vectors;
    }
    lastError = body?.error?.message || `HTTP ${res.status}`;
    // Retry only rate limits and server errors; a bad key or bad input won't get better.
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`Embedding failed: ${lastError}`);
}

/**
 * Embed many texts: batches of 20, a few requests in parallel, retries on
 * 429/5xx. `onProgress(done)` is called after each group of batches.
 * Throws if any text could not be embedded.
 */
export async function embedTexts(
  texts: string[],
  onBatch: (start: number, vectors: number[][]) => Promise<void>,
  cfg: EmbeddingConfig = embeddingConfig(),
): Promise<void> {
  const group = BATCH_SIZE * PARALLEL_REQUESTS;
  for (let start = 0; start < texts.length; start += group) {
    const slice = texts.slice(start, start + group);
    const batches: string[][] = [];
    for (let i = 0; i < slice.length; i += BATCH_SIZE) batches.push(slice.slice(i, i + BATCH_SIZE));
    const results = await Promise.all(batches.map((b) => embedBatch(cfg, b.map((t) => t.trim() || ' '))));
    await onBatch(start, results.flat());
  }
}

/** Embed one text (e.g. a search query). */
export async function embedOne(text: string, cfg: EmbeddingConfig = embeddingConfig()): Promise<number[]> {
  const [vector] = await embedBatch(cfg, [text.trim() || ' ']);
  return vector;
}
