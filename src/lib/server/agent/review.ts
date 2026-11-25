import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type StaffCaller } from '@/lib/server/staff-auth';
import { displayMessages } from './display';
import { getConversation, listAnswerRatings, viewBranch } from './store';

/**
 * Research-team review of everyone's AI assistant conversations (dashboard: AI Conversations):
 * patients' chats and Careteam/Admin test chats.
 *
 * Read-only: nothing here changes what the owner sees (switching versions does not move the
 * owner's current_leaf_id). Conversations their owner deleted are not available. Every opened
 * conversation is written to audit_log before any message is returned: when the record cannot
 * be written, the request fails (no record, no data).
 */

export const REVIEW_ROLES = ['patient', 'staff', 'admin'] as const;
export type ReviewRole = (typeof REVIEW_ROLES)[number];

export interface ReviewUser {
  id: string;
  role: string | null;
  fullName: string;
  username: string;
  displayId: string | null;
}

export interface ReviewConversation {
  id: string;
  title: string | null;
  activityAt: string;
  user: ReviewUser;
}

/** Position in the list: the last conversation of the page before. */
export interface ReviewCursor {
  at: string;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const encodeCursor = (c: ReviewCursor) => `${c.at}|${c.id}`;

export function decodeCursor(value: string | null): ReviewCursor | null {
  if (!value) return null;
  const [at, id] = value.split('|');
  if (!at || !id || !UUID.test(id) || Number.isNaN(Date.parse(at))) throw new ApiError(400, 'Invalid request.');
  return { at, id };
}

type Row = Record<string, any>;

const toUser = (id: string, role: string | null, p: Row | null | undefined): ReviewUser => ({
  id,
  role,
  fullName: ((p?.full_name as string | null) ?? '').trim(),
  username: (p?.username as string | null) ?? '',
  displayId: (p?.display_id as string | null) || null,
});

/** Conversations (all roles, or one), newest activity first, `limit` per page. */
export async function listReviewConversations(
  admin: SupabaseClient,
  options: { search: string; role: ReviewRole | null; before: ReviewCursor | null; limit: number },
): Promise<{ conversations: ReviewConversation[]; next: string | null }> {
  const { data, error } = await admin.rpc('staff_ai_conversations', {
    p_search: options.search || null,
    p_role: options.role,
    p_before_at: options.before?.at ?? null,
    p_before_id: options.before?.id ?? null,
    p_limit: options.limit + 1,
  });
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const page = rows.slice(0, options.limit);
  const conversations = page.map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? null,
    activityAt: r.activity_at as string,
    user: toUser(r.user_id as string, (r.role as string | null) ?? null, r),
  }));
  const last = conversations[conversations.length - 1];
  return { conversations, next: rows.length > options.limit && last ? encodeCursor({ at: last.activityAt, id: last.id }) : null };
}

/**
 * One conversation for review: the branch on screen, or with `versionId` the newest branch under
 * that version (any message of the conversation); with its owner's ratings of the answers.
 */
export async function openReviewConversation(
  admin: SupabaseClient,
  caller: StaffCaller,
  conversationId: string,
  versionId: string | null,
) {
  const { data: row, error } = await admin
    .from('agent_conversations')
    .select('user_id, last_message_at, created_at')
    .eq('id', conversationId)
    .eq('deleted', false)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new ApiError(404, 'Conversation not found.');
  const ownerId = row.user_id as string;

  const [{ data: role, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from('account_roles').select('role').eq('user_id', ownerId).maybeSingle(),
    admin.from('profiles').select('full_name, username, display_id').eq('id', ownerId).maybeSingle(),
  ]);
  if (roleError) throw roleError;
  if (profileError) throw profileError;

  const { error: auditError } = await admin.from('audit_log').insert({
    actor_id: caller.userId,
    actor_role: caller.role,
    action: 'ai_conversation.view',
    target_type: 'agent_conversation',
    target_id: conversationId,
    subject_user_id: ownerId,
    details: versionId ? { version: versionId } : {},
  });
  if (auditError) throw auditError;

  const conversation = await getConversation(admin, ownerId, conversationId);
  const [rows, ratings] = await Promise.all([
    viewBranch(admin, conversation, versionId),
    listAnswerRatings(admin, ownerId, conversationId),
  ]);

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      activityAt: ((row.last_message_at as string | null) ?? row.created_at) as string,
      user: toUser(ownerId, (role?.role as string | null) ?? null, profile),
    } satisfies ReviewConversation,
    messages: displayMessages({ role: caller.role }, rows),
    ratings,
  };
}
