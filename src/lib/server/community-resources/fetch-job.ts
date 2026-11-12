import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { en } from '@/lib/i18n/staff/en';
import {
  RESOURCE_COLUMNS,
  emptyRunUsage,
  needsWebsiteCheck,
  toResource,
  type CommunityResource,
  type ResourceAiUsage,
} from '@/lib/community-resources';
import { PageError, fetchPageText } from './page-text';
import { summarizePage, type Summarizer } from './summarize';
import { errorText, runReporter, startRun } from './runs';

/**
 * "Update from websites": for every active resource with a website that needs a check (never
 * summarized, website changed, failed last time, or older than 30 days), read the website and
 * have the AI write ai_summary. Runs in the background after the request has answered; the page
 * polls community_resource_runs. Four resources at a time; one failing does not stop the others.
 *
 * Token use: each resource's ai_usage holds its call (with the run id), and the run row's usage
 * holds the run's totals.
 */

const CONCURRENCY = 4;
/** This many AI failures in a row (no key, no credit, provider down) stop the run. */
const MAX_AI_FAILURES_IN_A_ROW = 5;

export async function prepareFetchRun(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('community_resources')
    .select(RESOURCE_COLUMNS)
    .eq('is_active', true)
    .not('website', 'is', null);
  if (error) throw error;
  const now = Date.now();
  const targets = ((data ?? []) as unknown as Record<string, unknown>[]).map(toResource).filter((r) => needsWebsiteCheck(r, now));
  if (!targets.length) return { runId: null, targets };
  const runId = await startRun(admin, 'fetch', userId, targets.length);
  return { runId, targets };
}

export async function runFetchJob(admin: SupabaseClient, runId: string, targets: CommunityResource[], s: Summarizer): Promise<void> {
  const usage = emptyRunUsage();
  let processed = 0;
  let okCount = 0;
  let failedCount = 0;
  let skipped = 0;
  let aiFailuresInARow = 0;
  let stopError: string | null = null;
  const reporter = runReporter(admin, runId, () => ({ processed, okCount, failedCount, usage, result: { skipped } }));

  const save = async (r: CommunityResource, fields: Record<string, unknown>) => {
    // Only if the website is still the one we read (staff may have changed it meanwhile).
    const { data, error } = await admin
      .from('community_resources')
      .update(fields)
      .eq('id', r.id)
      .eq('website', r.website)
      .select('id');
    if (error) throw error;
    return !!data?.length;
  };

  const processOne = async (r: CommunityResource) => {
    const fetchedAt = new Date().toISOString();
    let failure: string;
    try {
      const page = await fetchPageText(r.website);
      try {
        const out = await summarizePage(s, { name: r.name, categoryName: en.resources.categories[r.category] }, page);
        aiFailuresInARow = 0;
        usage.inputTokens += out.usage.inputTokens;
        usage.cachedInputTokens += out.usage.cachedInputTokens;
        usage.outputTokens += out.usage.outputTokens;
        usage.reasoningTokens += out.usage.reasoningTokens;
        usage.toolCalls += out.usage.toolCalls;
        usage.modelCalls += 1;
        usage.models[out.usage.model] = (usage.models[out.usage.model] ?? 0) + 1;
        const aiUsage: ResourceAiUsage = { runId, ...out.usage, at: fetchedAt };
        const saved = await save(r, {
          ai_status: 'ok',
          ai_summary: out.summary,
          ai_error: null,
          ai_fetched_at: fetchedAt,
          ai_source_url: r.website,
          ai_usage: aiUsage,
        });
        if (saved) okCount++;
        else skipped++;
        return;
      } catch (e) {
        aiFailuresInARow++;
        failure = `AI summary failed: ${errorText(e).slice(0, 300)}`;
        if (aiFailuresInARow >= MAX_AI_FAILURES_IN_A_ROW) stopError = failure;
      }
    } catch (e) {
      failure = e instanceof PageError ? e.message : 'Could not reach the website.';
    }
    failedCount++;
    await save(r, {
      ai_status: 'failed',
      ai_summary: null,
      ai_error: failure.slice(0, 1000),
      ai_fetched_at: fetchedAt,
      ai_source_url: r.website,
    }).catch((e) => console.warn('[community-resources] could not save a failure', errorText(e)));
  };

  try {
    const queue = [...targets];
    const worker = async () => {
      for (;;) {
        if (stopError || !reporter.alive) return;
        const r = queue.shift();
        if (!r) return;
        try {
          await processOne(r);
        } catch (e) {
          // A database error while saving: counted as failed, the run goes on.
          failedCount++;
          console.warn('[community-resources] resource failed', r.id, errorText(e));
        }
        processed++;
        reporter.report();
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    await reporter.finish(stopError ? 'failed' : 'done', stopError ?? undefined);
  } catch (e) {
    console.error('[community-resources] website update failed', e);
    await reporter.finish('failed', errorText(e, 'Something went wrong. Please try again.'));
  }
}
