import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Broadcast inbox (Users > Broadcast Message). Every account that a broadcast was
 * sent to has its own inbox: staff read it here, patients in the app. Rows come
 * from the inbox_* functions (migration 20261123000100_broadcast_inbox.sql).
 * Read state is one cursor per person: messages sent after it are unread.
 */
export interface InboxItem {
  id: string;
  content: string;
  createdAt: string;
  /** Sent after this person's read cursor. */
  unread: boolean;
  /** The sender's Display ID (else full name); null when neither is set. */
  senderName: string | null;
}

export class InboxError extends Error {}

export const INBOX_PAGE = 50;

export async function listInbox(supabase: SupabaseClient, before?: string): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc('inbox_list', { p_limit: INBOX_PAGE, p_before: before ?? null });
  if (error) throw new InboxError(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    content: String(r.content ?? ''),
    createdAt: String(r.created_at),
    unread: r.unread === true,
    senderName: typeof r.sender_name === 'string' && r.sender_name.trim() ? r.sender_name.trim() : null,
  }));
}

export async function inboxUnreadCount(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('inbox_unread_count');
  if (error) throw new InboxError(error.message);
  return Number(data) || 0;
}

/** Moves the read cursor to `until` (the newest message shown): it and everything older is read. */
export async function markInboxRead(supabase: SupabaseClient, until: string): Promise<void> {
  const { error } = await supabase.rpc('inbox_mark_read', { p_until: until });
  if (error) throw new InboxError(error.message);
}
