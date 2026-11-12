import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/server/staff-auth';
import { RUN_STALE_MS, type ResourceRunKind, type ResourceRunUsage } from '@/lib/community-resources';

/**
 * Rows of public.community_resource_runs: one per "Update from websites" or "Publish" run.
 * The database allows one running row at a time; a running row whose heartbeat is older than
 * RUN_STALE_MS belongs to a run that died (server restart) and is closed when the next starts.
 */

export const INTERRUPTED = 'The server stopped before the run finished.';
export const BUSY = 'Another update or publish is running. Wait until it finishes.';

const HEARTBEAT_MS = 30_000;

export async function startRun(admin: SupabaseClient, kind: ResourceRunKind, userId: string, total: number): Promise<string> {
  const now = new Date();
  await admin
    .from('community_resource_runs')
    .update({ status: 'failed', error: INTERRUPTED, finished_at: now.toISOString() })
    .eq('status', 'running')
    .lt('heartbeat_at', new Date(now.getTime() - RUN_STALE_MS).toISOString());
  const { data, error } = await admin
    .from('community_resource_runs')
    .insert({ kind, status: 'running', total, started_by: userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, BUSY);
    throw error;
  }
  return String(data.id);
}

export interface RunProgress {
  processed?: number;
  okCount?: number;
  failedCount?: number;
  usage?: ResourceRunUsage;
  result?: Record<string, unknown>;
}

const progressRow = (p: RunProgress) => ({
  ...(p.processed !== undefined ? { processed: p.processed } : {}),
  ...(p.okCount !== undefined ? { ok_count: p.okCount } : {}),
  ...(p.failedCount !== undefined ? { failed_count: p.failedCount } : {}),
  ...(p.usage !== undefined ? { usage: p.usage } : {}),
  ...(p.result !== undefined ? { result: p.result } : {}),
});

/**
 * Progress writer for one run. Writes go out one after another with the latest numbers, so an
 * older write can never land after a newer one. `alive` turns false once the row is no longer
 * running (closed as interrupted by another start): the job should stop.
 */
export function runReporter(admin: SupabaseClient, runId: string, snapshot: () => RunProgress) {
  let chain: Promise<void> = Promise.resolve();
  let alive = true;
  const write = () => {
    chain = chain.then(async () => {
      if (!alive) return;
      const { data, error } = await admin
        .from('community_resource_runs')
        .update({ ...progressRow(snapshot()), heartbeat_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'running')
        .select('id');
      if (!error && !data?.length) alive = false;
    });
    return chain;
  };
  const timer = setInterval(() => void write(), HEARTBEAT_MS);
  return {
    report: () => void write(),
    get alive() {
      return alive;
    },
    /** Final write: status done / failed. */
    async finish(status: 'done' | 'failed', error?: string) {
      clearInterval(timer);
      await chain.catch(() => {});
      await admin
        .from('community_resource_runs')
        .update({
          ...progressRow(snapshot()),
          status,
          error: error ? error.slice(0, 1000) : null,
          heartbeat_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .eq('status', 'running');
    },
  };
}

export const errorText = (e: unknown, fallback = 'unknown error') =>
  e instanceof Error && e.message
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String((e as { message: unknown }).message)
      : fallback;
