import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RESOURCE_COLUMNS, toResource } from '@/lib/community-resources';
import { ApiError } from '@/lib/server/staff-auth';
import { KNOWLEDGE_BUCKET } from '@/lib/server/knowledge';
import { DEFAULT_BUDGET, type ChunkBudget } from '@/lib/server/rag';
import { budgetToSettings, parseThenChunk, removeDocumentFiles } from '@/app/api/admin/knowledge/process';
import { ARTICLE_DESCRIPTION, ARTICLE_FILE, articleHash, buildArticle, type Article } from './article';
import { errorText, runReporter, startRun } from './runs';

/**
 * "Publish to knowledge base": the directory article goes into the knowledge base
 * "Community Resources (generated)" through the same pipeline as an uploaded file
 * (storage → parse → chunk → embed), then replaces the article published before.
 *
 * The new document stays switched off until it is fully chunked and embedded; only then is it
 * switched on and the old one deleted. If anything fails, the new document is removed and the
 * old one keeps answering, so there is never a moment with neither.
 */

export const RESOURCES_KB_SLUG = 'community_resources';
const RESOURCES_KB_NAME = 'Community Resources (generated)';
const RESOURCES_KB_DESCRIPTION =
  'Generated from the community resource directory (Content > Community Resources). Publishing there replaces its document.';

export async function loadArticle(admin: SupabaseClient): Promise<Article> {
  const { data, error } = await admin.from('community_resources').select(RESOURCE_COLUMNS);
  if (error) throw error;
  return buildArticle(((data ?? []) as unknown as Record<string, unknown>[]).map(toResource));
}

interface ResourcesKb {
  id: string;
  budget: ChunkBudget;
}

/** The generated knowledge base (created by the migration; created again if someone deleted it). */
export async function resourcesKnowledgeBase(admin: SupabaseClient, userId: string | null, create: boolean): Promise<ResourcesKb | null> {
  const columns = 'id, chunk_target_chars, chunk_overlap_chars, chunk_tolerance_factor';
  const toKb = (r: Record<string, unknown>): ResourcesKb => ({
    id: String(r.id),
    budget: {
      maxChars: Number(r.chunk_target_chars) || DEFAULT_BUDGET.maxChars,
      overlapChars: Number(r.chunk_overlap_chars ?? DEFAULT_BUDGET.overlapChars),
      toleranceFactor: Number(r.chunk_tolerance_factor) || DEFAULT_BUDGET.toleranceFactor,
      rowsPerChunk: DEFAULT_BUDGET.rowsPerChunk,
    },
  });
  const { data, error } = await admin.from('knowledge_bases').select(columns).eq('slug', RESOURCES_KB_SLUG).maybeSingle();
  if (error) throw error;
  if (data) return toKb(data as Record<string, unknown>);
  if (!create) return null;
  const { data: made, error: insErr } = await admin
    .from('knowledge_bases')
    .insert({ name: RESOURCES_KB_NAME, slug: RESOURCES_KB_SLUG, description: RESOURCES_KB_DESCRIPTION, created_by: userId })
    .select(columns)
    .single();
  if (insErr) throw new Error(`Could not prepare the knowledge base: ${insErr.message}`);
  return toKb(made as Record<string, unknown>);
}

/** The published article(s): documents of source_type 'resources' in the generated knowledge base. */
export async function publishedDocuments(admin: SupabaseClient, kbId: string) {
  const { data, error } = await admin
    .from('knowledge_documents')
    .select('id, sha256, status, is_active, chunk_count, processed_at')
    .eq('knowledge_base_id', kbId)
    .eq('source_type', 'resources')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    sha256: string | null;
    status: string;
    is_active: boolean;
    chunk_count: number;
    processed_at: string | null;
  }[];
}

/** Check the preview is still current and claim the run. */
export async function preparePublish(admin: SupabaseClient, hash: string, userId: string) {
  const article = await loadArticle(admin);
  if (!article.entryCount) throw new ApiError(400, 'There are no active resources to publish.');
  if (hash !== article.hash) throw new ApiError(409, 'The directory changed since the preview. Open the preview again.');
  const runId = await startRun(admin, 'publish', userId, 1);
  return { runId, article };
}

async function removeDocuments(admin: SupabaseClient, ids: string[]) {
  if (!ids.length) return;
  await removeDocumentFiles(admin, ids);
  const { error } = await admin.from('knowledge_documents').delete().in('id', ids);
  if (error) throw error;
}

export async function runPublishJob(admin: SupabaseClient, runId: string, article: Article, userId: string): Promise<void> {
  let result: Record<string, unknown> = { entryCount: article.entryCount, withSummary: article.withSummary };
  let processed = 0;
  let okCount = 0;
  let failedCount = 0;
  const reporter = runReporter(admin, runId, () => ({ processed, okCount, failedCount, result }));
  let newId: string | null = null;
  try {
    const kb = (await resourcesKnowledgeBase(admin, userId, true))!;
    const bytes = new TextEncoder().encode(article.markdown);
    const sha256 = articleHash(article.markdown);
    const old = await publishedDocuments(admin, kb.id);

    const same = old.find((d) => d.sha256 === sha256);
    if (same && same.status === 'ready' && same.is_active) {
      // Nothing changed: keep it, and clear any leftovers from earlier runs.
      await removeDocuments(admin, old.filter((d) => d.id !== same.id).map((d) => d.id));
      processed = 1;
      okCount = 1;
      result = { ...result, unchanged: true, documentId: same.id, chunkCount: same.chunk_count };
      await reporter.finish('done');
      return;
    }
    // A copy with the same text that is not answering (failed earlier) is in the way of the new one.
    if (same) await removeDocuments(admin, [same.id]);
    const replace = old.filter((d) => d.id !== same?.id).map((d) => d.id);

    newId = randomUUID();
    const storagePath = `${newId}/${ARTICLE_FILE}`;
    const { error: upErr } = await admin.storage
      .from(KNOWLEDGE_BUCKET)
      .upload(storagePath, bytes, { contentType: 'text/markdown', upsert: false });
    if (upErr) throw new Error(`Could not store the file: ${upErr.message}`);
    const { error: insErr } = await admin.from('knowledge_documents').insert({
      id: newId,
      knowledge_base_id: kb.id,
      title: article.title,
      description: ARTICLE_DESCRIPTION,
      source_type: 'resources',
      file_name: ARTICLE_FILE,
      storage_path: storagePath,
      mime_type: 'text/markdown',
      size_bytes: bytes.length,
      sha256,
      status: 'parsing',
      // Off until it is fully chunked and embedded.
      is_active: false,
      uploaded_by: userId,
      pending_chunk_settings: budgetToSettings(kb.budget),
      job_progress: { phase: 'parsing' },
    });
    if (insErr) {
      await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
      throw insErr;
    }
    result = { ...result, documentId: newId };
    reporter.report();

    const job = await parseThenChunk(admin, newId, kb.budget);
    if (!job.ok) throw new Error(job.error || 'Could not chunk this document.');

    const { error: onErr } = await admin.from('knowledge_documents').update({ is_active: true }).eq('id', newId);
    if (onErr) throw onErr;
    const published = newId;
    newId = null; // from here on the new article stays, whatever happens to the old one
    let warning: string | undefined;
    try {
      await removeDocuments(admin, replace);
    } catch (e) {
      // Both are switched on until the next publish removes the old one; answers still work.
      warning = errorText(e);
      console.warn('[community-resources] could not remove the previous article', warning);
    }
    processed = 1;
    okCount = 1;
    result = { ...result, documentId: published, chunkCount: job.chunkCount, replaced: replace.length, ...(warning ? { warning } : {}) };
    await reporter.finish('done');
  } catch (e) {
    console.error('[community-resources] publish failed', e);
    if (newId) await removeDocuments(admin, [newId]).catch((err) => console.warn('[community-resources] cleanup failed', errorText(err)));
    processed = 1;
    failedCount = 1;
    await reporter.finish('failed', errorText(e, 'Something went wrong. Please try again.'));
  }
}
