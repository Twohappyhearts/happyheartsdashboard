import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  IMAGE_MIME,
  KNOWLEDGE_BUCKET,
  MINERU_ONLY,
  MINERU_PREFERRED,
  PARSED_FILE,
  detectKind,
  pdfToMarkdown,
  type KnowledgeKind,
} from '@/lib/server/knowledge';
import { createMinerUTask, downloadMinerUResult, getMinerUTask, mineruConfigured } from '@/lib/server/mineru';
import { type ChunkBudget, chunkMarkdown } from '@/lib/server/rag';
import { embedTexts, embeddingConfig } from '@/lib/server/embeddings';

export { removeDocumentFiles } from './files';

/**
 * One "Chunk" job per document, all or nothing:
 *
 *   claim (status → parsing / processing)
 *     → parse to Markdown if needed (built-in now, or MinerU: finished later by refreshParse)
 *     → chunk (block-aware) → embed every chunk → insert under a new generation
 *     → knowledge_commit_chunks(): switch the document to the new generation
 *
 * Any failure deletes the new generation's rows and puts the document back to
 * where it was (previous chunks kept), with the error recorded. Nothing here throws.
 */

import { STALE_MS } from './claim';

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : fallback;

export const budgetToSettings = (b: ChunkBudget) => ({
  target_chars: b.maxChars,
  overlap_chars: b.overlapChars,
  tolerance_factor: b.toleranceFactor,
  rows_per_chunk: b.rowsPerChunk,
});

const settingsToBudget = (s: Record<string, unknown>): ChunkBudget => ({
  maxChars: Number(s.target_chars),
  overlapChars: Number(s.overlap_chars),
  toleranceFactor: Number(s.tolerance_factor ?? 3),
  rowsPerChunk: Number(s.rows_per_chunk ?? 50),
});

/** Undo a failed job: drop its rows (if any) and restore the previous status. */
async function rollback(admin: SupabaseClient, docId: string, message: string, generation?: string) {
  if (generation) await admin.from('knowledge_chunks').delete().eq('document_id', docId).eq('generation', generation);
  const { data: doc } = await admin
    .from('knowledge_documents')
    .select('chunk_generation, parsed_path')
    .eq('id', docId)
    .maybeSingle();
  const status = doc?.chunk_generation ? 'ready' : doc?.parsed_path ? 'parsed' : 'uploaded';
  await admin
    .from('knowledge_documents')
    .update({ status, error: message.slice(0, 500), job_progress: null, parse_progress: null, pending_chunk_settings: null })
    .eq('id', docId);
}

// ---------------------------------------------------------------------------
// Files

async function uploadAsset(admin: SupabaseClient, docId: string, name: string, bytes: Uint8Array) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = IMAGE_MIME[ext];
  if (!contentType) return false; // e.g. emf/wmf from Word: skip
  const { error } = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(`${docId}/assets/${name}`, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Could not store image ${name}: ${error.message}`);
  return true;
}

/** Store the parsed Markdown. Status is left alone — the job continues to chunking. */
async function saveParsed(admin: SupabaseClient, docId: string, markdown: string, pageCount: number | null, parser: 'builtin' | 'mineru') {
  if (!markdown.trim()) throw new Error('No text found in this file. Scanned pages without a text layer need MinerU.');
  const path = `${docId}/${PARSED_FILE}`;
  const { error } = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(path, new TextEncoder().encode(markdown), { contentType: 'text/markdown', upsert: true });
  if (error) throw new Error(`Could not store the parsed Markdown: ${error.message}`);
  await admin
    .from('knowledge_documents')
    .update({
      parser,
      parse_progress: null,
      parsed_path: path,
      parsed_at: new Date().toISOString(),
      page_count: pageCount,
      char_count: markdown.length,
    })
    .eq('id', docId);
}

// ---------------------------------------------------------------------------
// Parse

async function builtinMarkdown(admin: SupabaseClient, docId: string, kind: KnowledgeKind, bytes: Uint8Array) {
  if (kind === 'md' || kind === 'txt') return { markdown: new TextDecoder('utf-8').decode(bytes), pageCount: null };
  if (kind === 'pdf') return pdfToMarkdown(bytes);
  if (kind === 'docx') {
    const mammoth = await import('mammoth');
    let n = 0;
    const { value: html } = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const ext = (image.contentType.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const name = `img-${++n}.${ext}`;
          const stored = await uploadAsset(admin, docId, name, new Uint8Array(await image.readAsArrayBuffer()));
          return { src: stored ? `assets/${name}` : '' };
        }),
      },
    );
    const { default: TurndownService } = await import('turndown');
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    td.keep(['table']); // tables stay HTML (merged cells survive), like MinerU output
    td.remove(['style', 'script']);
    return { markdown: td.turndown(html).replace(/!\[[^\]]*\]\(\)/g, ''), pageCount: null };
  }
  throw new Error('This file type needs MinerU. Set MINERU_API_TOKEN on the server to parse it.');
}

/**
 * Parse the original file, then (built-in) chunk + embed right away, or
 * (MinerU) leave a task running that refreshParse() picks up.
 * Caller has claimed the document (status 'parsing') and stored pending_chunk_settings.
 */
export async function parseThenChunk(admin: SupabaseClient, docId: string, budget: ChunkBudget): Promise<JobResult> {
  try {
    const { data: doc } = await admin
      .from('knowledge_documents')
      .select('storage_path, file_name')
      .eq('id', docId)
      .maybeSingle();
    if (!doc?.storage_path) throw new Error('The original file is missing.');
    const { data: blob, error } = await admin.storage.from(KNOWLEDGE_BUCKET).download(doc.storage_path);
    if (error || !blob) throw new Error('Could not read the stored file.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = detectKind(doc.file_name ?? doc.storage_path, bytes);
    if (!info) throw new Error('Unsupported file type.');

    if (MINERU_PREFERRED.includes(info.kind) && mineruConfigured()) {
      // MinerU fetches the file itself from a temporary signed link.
      const { data: signed, error: signErr } = await admin.storage
        .from(KNOWLEDGE_BUCKET)
        .createSignedUrl(doc.storage_path, 6 * 60 * 60);
      if (signErr || !signed) throw new Error('Could not create a link for MinerU.');
      const taskId = await createMinerUTask(signed.signedUrl, docId);
      await admin
        .from('knowledge_documents')
        .update({ parser: 'mineru', parse_task_id: taskId, parse_progress: { state: 'pending' }, job_progress: { phase: 'parsing' } })
        .eq('id', docId);
      return { ok: true, status: 'parsing', chunkCount: 0 };
    }
    if (MINERU_ONLY.includes(info.kind)) {
      throw new Error('PowerPoint and .doc files are parsed by MinerU. Set MINERU_API_TOKEN on the server.');
    }
    const { markdown, pageCount } = await builtinMarkdown(admin, docId, info.kind, bytes);
    await saveParsed(admin, docId, markdown, pageCount, 'builtin');
  } catch (e) {
    const message = `Parsing failed: ${errorMessage(e, 'could not parse this file')}`;
    await rollback(admin, docId, message);
    return { ok: false, status: 'failed', chunkCount: 0, error: message };
  }
  return chunkAndEmbed(admin, docId, budget);
}

/** Check a MinerU task; when it is done, import the result and continue with chunk + embed. */
export async function refreshParse(admin: SupabaseClient, docId: string): Promise<void> {
  const { data: doc } = await admin
    .from('knowledge_documents')
    .select('status, parser, parse_task_id, parse_progress, pending_chunk_settings, updated_at')
    .eq('id', docId)
    .maybeSingle();
  if (!doc || doc.status !== 'parsing' || doc.parser !== 'mineru' || !doc.parse_task_id) return;
  const progress = (doc.parse_progress ?? {}) as { state?: string };
  const stale = Date.now() - new Date(doc.updated_at as string).getTime() > STALE_MS;
  if (progress.state === 'importing' && !stale) return; // another request is importing it

  try {
    const task = await getMinerUTask(doc.parse_task_id as string);
    if (task.state === 'failed') throw new Error(`MinerU could not parse this file: ${task.error ?? 'unknown error'}`);
    if (task.state !== 'done' || !task.zipUrl) {
      await admin
        .from('knowledge_documents')
        .update({
          parse_progress: { state: task.state, extracted_pages: task.extractedPages, total_pages: task.totalPages },
          ...(task.totalPages ? { page_count: task.totalPages } : {}),
        })
        .eq('id', docId)
        .eq('status', 'parsing');
      return;
    }
    // Claim the import so two polling tabs don't both do it.
    const { data: claimed } = await admin
      .from('knowledge_documents')
      .update({ parse_progress: { state: 'importing' } })
      .eq('id', docId)
      .eq('status', 'parsing')
      .eq('updated_at', doc.updated_at as string)
      .select('id');
    if (!claimed?.length) return;

    const result = await downloadMinerUResult(task.zipUrl);
    let markdown = result.markdown;
    for (const img of result.images) {
      const name = img.path.split('/').pop()!;
      if (await uploadAsset(admin, docId, name, img.bytes)) markdown = markdown.split(img.path).join(`assets/${name}`);
    }
    await saveParsed(admin, docId, markdown, result.pageCount ?? task.totalPages, 'mineru');
  } catch (e) {
    await rollback(admin, docId, `Parsing failed: ${errorMessage(e, 'could not get the MinerU result')}`);
    return;
  }

  const pending = doc.pending_chunk_settings as Record<string, unknown> | null;
  if (pending) await chunkAndEmbed(admin, docId, settingsToBudget(pending));
  else await admin.from('knowledge_documents').update({ status: 'parsed', job_progress: null }).eq('id', docId);
}

// ---------------------------------------------------------------------------
// Chunk + embed

export interface JobResult {
  ok: boolean;
  status: string;
  chunkCount: number;
  error?: string;
}

/**
 * Chunk the parsed Markdown, embed every chunk and commit the new set
 * atomically. On any failure the new rows are deleted and the document keeps
 * its previous chunks.
 */
export async function chunkAndEmbed(admin: SupabaseClient, docId: string, budget: ChunkBudget): Promise<JobResult> {
  const generation = randomUUID();
  try {
    const cfg = embeddingConfig(); // fail fast if embeddings aren't configured
    await admin
      .from('knowledge_documents')
      .update({ status: 'processing', job_progress: { phase: 'chunking' }, parse_progress: null })
      .eq('id', docId);

    const { data: doc } = await admin
      .from('knowledge_documents')
      .select('parsed_path, chunk_generation')
      .eq('id', docId)
      .maybeSingle();
    if (!doc?.parsed_path) throw new Error('The document has no parsed text.');
    const { data: blob, error } = await admin.storage.from(KNOWLEDGE_BUCKET).download(doc.parsed_path);
    if (error || !blob) throw new Error('Could not read the parsed Markdown.');
    const markdown = await blob.text();

    const resolveAsset = (src: string) => {
      if (/^https?:\/\//i.test(src)) return src;
      if (src.startsWith('assets/') && !src.includes('..')) return `${docId}/${src}`;
      return null;
    };
    const chunks = chunkMarkdown(markdown, budget, resolveAsset);
    if (!chunks.length) throw new Error('No text to chunk.');

    // Leftovers of an earlier crashed job (neither committed nor this job).
    let cleanup = admin.from('knowledge_chunks').delete().eq('document_id', docId);
    cleanup = doc.chunk_generation ? cleanup.neq('generation', doc.chunk_generation as string) : cleanup;
    await cleanup;

    await admin
      .from('knowledge_documents')
      .update({ job_progress: { phase: 'embedding', done: 0, total: chunks.length } })
      .eq('id', docId);

    await embedTexts(
      chunks.map((c) => c.embeddingText),
      async (start, vectors) => {
        const rows = vectors.map((embedding, k) => {
          const c = chunks[start + k];
          return {
            document_id: docId,
            generation,
            chunk_index: c.index,
            content: c.content.slice(0, 32000),
            embedding_text: c.embeddingText.slice(0, 32000),
            token_count: c.tokenCount,
            metadata: { outline_path: c.outlinePath, ...(c.assets.length ? { assets: c.assets } : {}) },
            embedding,
          };
        });
        const { error: insErr } = await admin.from('knowledge_chunks').insert(rows);
        if (insErr) throw new Error(`Could not save chunks: ${insErr.message}`);
        await admin
          .from('knowledge_documents')
          .update({ job_progress: { phase: 'embedding', done: start + vectors.length, total: chunks.length } })
          .eq('id', docId);
      },
      cfg,
    );

    // All embedded: switch the document to the new generation in one statement.
    const { error: commitErr } = await admin.rpc('knowledge_commit_chunks', {
      p_document_id: docId,
      p_generation: generation,
      p_expected_count: chunks.length,
      p_settings: budgetToSettings(budget),
      p_embedding_model: cfg.model,
    });
    if (commitErr) throw new Error(`Could not commit chunks: ${commitErr.message}`);

    // Old generation is now invisible; remove its rows (best effort).
    await admin.from('knowledge_chunks').delete().eq('document_id', docId).neq('generation', generation);
    return { ok: true, status: 'ready', chunkCount: chunks.length };
  } catch (e) {
    const message = errorMessage(e, 'Could not chunk this document.');
    await rollback(admin, docId, message, generation);
    return { ok: false, status: 'failed', chunkCount: 0, error: message };
  }
}
