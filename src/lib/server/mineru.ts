import 'server-only';

/**
 * MinerU cloud API (https://mineru.net): PDF / Word / PowerPoint → Markdown + images.
 * Flow: create a task with a (signed) file URL → poll → download the result zip.
 * Server-only: MINERU_API_TOKEN must never reach the browser.
 */

const API_BASE = (process.env.MINERU_API_BASE || 'https://mineru.net/api/v4').replace(/\/+$/, '');

export function mineruConfigured(): boolean {
  return !!process.env.MINERU_API_TOKEN;
}

export type MinerUState = 'pending' | 'running' | 'converting' | 'done' | 'failed' | 'waiting-file';

export interface MinerUTask {
  state: MinerUState;
  zipUrl: string | null;
  error: string | null;
  extractedPages: number | null;
  totalPages: number | null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.MINERU_API_TOKEN;
  if (!token) throw new Error('MinerU is not configured (MINERU_API_TOKEN is missing).');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: '*/*', ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach MinerU. Check the network and try again.');
  }
  const body = (await res.json().catch(() => null)) as { code?: number; msg?: string; data?: T } | null;
  if (!res.ok || !body || (body.code !== undefined && body.code !== 0)) {
    const msg = body?.msg || `HTTP ${res.status}`;
    if (res.status === 401 || /token/i.test(msg)) throw new Error(`MinerU rejected the API token (${msg}). Check MINERU_API_TOKEN.`);
    throw new Error(`MinerU: ${msg}`);
  }
  return body.data as T;
}

/** Start parsing a file reachable at `url` (e.g. a signed Storage URL). Returns the task id. */
export async function createMinerUTask(url: string, dataId: string): Promise<string> {
  const data = await call<{ task_id: string }>('/extract/task', {
    method: 'POST',
    body: JSON.stringify({
      url,
      data_id: dataId,
      model_version: process.env.MINERU_MODEL_VERSION || 'vlm',
      enable_table: true,
      enable_formula: true,
      ...(process.env.MINERU_LANGUAGE ? { language: process.env.MINERU_LANGUAGE } : {}),
    }),
  });
  if (!data?.task_id) throw new Error('MinerU did not return a task id.');
  return data.task_id;
}

export async function getMinerUTask(taskId: string): Promise<MinerUTask> {
  const data = await call<{
    state: MinerUState;
    full_zip_url?: string;
    err_msg?: string;
    extract_progress?: { extracted_pages?: number; total_pages?: number };
  }>(`/extract/task/${encodeURIComponent(taskId)}`, { method: 'GET' });
  return {
    state: data.state,
    zipUrl: data.full_zip_url || null,
    error: data.err_msg || null,
    extractedPages: data.extract_progress?.extracted_pages ?? null,
    totalPages: data.extract_progress?.total_pages ?? null,
  };
}

export interface MinerUResult {
  markdown: string;
  /** Images referenced by the Markdown, keyed by their path inside the zip (e.g. "images/ab12.jpg"). */
  images: { path: string; bytes: Uint8Array }[];
  pageCount: number | null;
}

/** Download and unpack the result zip: full.md, images/*, *_content_list.json. */
export async function downloadMinerUResult(zipUrl: string): Promise<MinerUResult> {
  const res = await fetch(zipUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not download the MinerU result (HTTP ${res.status}).`);
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const mdName = names.find((n) => n === 'full.md' || n.endsWith('/full.md')) ?? names.find((n) => n.endsWith('.md'));
  if (!mdName) throw new Error('The MinerU result has no Markdown file.');
  const root = mdName.includes('/') ? mdName.slice(0, mdName.lastIndexOf('/') + 1) : '';
  const markdown = await zip.file(mdName)!.async('string');

  const images: MinerUResult['images'] = [];
  for (const n of names) {
    if (!n.startsWith(`${root}images/`)) continue;
    const rel = n.slice(root.length);
    if (!markdown.includes(rel)) continue; // only images the Markdown uses
    images.push({ path: rel, bytes: await zip.file(n)!.async('uint8array') });
  }

  let pageCount: number | null = null;
  const listName = names.find((n) => n.endsWith('content_list.json'));
  if (listName) {
    try {
      const list = JSON.parse(await zip.file(listName)!.async('string')) as { page_idx?: number }[];
      const max = Math.max(...list.map((x) => (typeof x.page_idx === 'number' ? x.page_idx : -1)));
      if (max >= 0) pageCount = max + 1;
    } catch {
      /* page count is optional */
    }
  }
  return { markdown, images, pageCount };
}
