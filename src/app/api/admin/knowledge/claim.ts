import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/server/staff-auth';

/** A job stuck longer than this (crash, server restart) may be started again. */
export const STALE_MS = 3 * 60 * 1000;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Atomically move a document into `next` ('parsing' / 'processing') unless a
 * step is already running on it (a step older than STALE_MS counts as dead).
 */
export async function claimDocument(admin: SupabaseClient, id: string, next: 'parsing' | 'processing', extra: Record<string, unknown> = {}) {
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await admin
    .from('knowledge_documents')
    .update({ status: next, error: null, ...extra })
    .eq('id', id)
    .or(`status.not.in.(parsing,processing),updated_at.lt.${staleBefore}`)
    .select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new ApiError(409, 'This document is being chunked. Wait until it finishes.');
  }
}

/** Reject edits/deletes while a chunk job is running (unless it looks dead). */
export function assertNotBusy(doc: { status?: string | null; updated_at?: string | null }) {
  const busy = doc.status === 'parsing' || doc.status === 'processing';
  const stale = doc.updated_at ? Date.now() - new Date(doc.updated_at).getTime() > STALE_MS : true;
  if (busy && !stale) throw new ApiError(409, 'This document is being chunked. Wait until it finishes.');
}
