import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isToolUIPart, type UIMessage } from 'ai';
import { ApiError } from '@/lib/server/staff-auth';

/**
 * Persistence for the agent. Everything goes through the service-role client,
 * so every function takes the caller's userId and filters by it.
 */

export type MessageStatus = 'NORMAL' | 'INTERRUPTED' | 'AWAITING_APPROVAL' | 'ERROR';

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  summary: string | null;
  summarizedUntilSeq: number;
  state: Record<string, unknown>;
}

export interface StoredMessage {
  seq: number;
  status: MessageStatus;
  durationMs: number | null;
  message: UIMessage;
}

/** What the agent needs to build its context: summary + business state + messages after the summary. */
export interface AgentState {
  conversation: Conversation;
  recent: StoredMessage[];
}

type Row = Record<string, any>;

const toConversation = (r: Row): Conversation => ({
  id: r.id,
  userId: r.user_id,
  title: r.title ?? null,
  summary: r.summary ?? null,
  summarizedUntilSeq: Number(r.summarized_until_seq ?? 0),
  state: (r.state ?? {}) as Record<string, unknown>,
});

const toStored = (r: Row): StoredMessage => ({
  seq: Number(r.seq),
  status: r.message_status as MessageStatus,
  durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
  message: { id: r.id, role: r.role, parts: Array.isArray(r.parts) ? r.parts : [] } as UIMessage,
});

export function plainText(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

export const hasPendingApproval = (message: UIMessage) =>
  message.parts.some((p) => isToolUIPart(p) && p.state === 'approval-requested');

// ---------------------------------------------------------------- conversations

export async function getConversation(admin: SupabaseClient, userId: string, id: string): Promise<Conversation> {
  const { data, error } = await admin
    .from('agent_conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('deleted', false)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Conversation not found.');
  return toConversation(data);
}

export async function createConversation(admin: SupabaseClient, userId: string, title: string | null): Promise<Conversation> {
  const { data, error } = await admin
    .from('agent_conversations')
    .insert({ user_id: userId, title })
    .select('*')
    .single();
  if (error) throw error;
  return toConversation(data);
}

export async function listConversations(admin: SupabaseClient, userId: string, limit = 50) {
  const { data, error } = await admin
    .from('agent_conversations')
    .select('id, title, last_message_at, created_at')
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? null,
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** Set the title once (only while it is still empty, so a rename is never overwritten). */
export async function setConversationTitle(admin: SupabaseClient, conversation: Conversation, title: string) {
  const { error } = await admin
    .from('agent_conversations')
    .update({ title })
    .eq('id', conversation.id)
    .eq('user_id', conversation.userId)
    .is('title', null);
  if (error) throw error;
}

/**
 * Soft delete: the conversation and its messages are hidden (deleted = true) and
 * the agent can no longer use them. Rows stay in the database for audit.
 */
export async function deleteConversation(admin: SupabaseClient, userId: string, conversationId: string) {
  const { data, error } = await admin
    .from('agent_conversations')
    .update({ deleted: true })
    .eq('id', conversationId)
    .eq('user_id', userId)
    .eq('deleted', false)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new ApiError(404, 'Conversation not found.');
  const { error: msgErr } = await admin
    .from('agent_messages')
    .update({ deleted: true })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (msgErr) throw msgErr;
}

/** Save a new summary unless another request summarized concurrently. Returns false if it lost the race. */
export async function saveSummary(
  admin: SupabaseClient,
  conversation: Conversation,
  summary: string,
  untilSeq: number,
): Promise<boolean> {
  const { data, error } = await admin
    .from('agent_conversations')
    .update({ summary, summarized_until_seq: untilSeq, summary_updated_at: new Date().toISOString() })
    .eq('id', conversation.id)
    .eq('user_id', conversation.userId)
    .eq('summarized_until_seq', conversation.summarizedUntilSeq)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function saveConversationState(admin: SupabaseClient, conversation: Conversation, state: Record<string, unknown>) {
  const { error } = await admin
    .from('agent_conversations')
    .update({ state })
    .eq('id', conversation.id)
    .eq('user_id', conversation.userId);
  if (error) throw error;
}

async function touchConversation(admin: SupabaseClient, conversationId: string) {
  await admin.from('agent_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
}

// ---------------------------------------------------------------- messages

/** Conversation + the messages the summary does not cover yet. */
export async function loadState(admin: SupabaseClient, userId: string, conversationId: string): Promise<AgentState> {
  const conversation = await getConversation(admin, userId, conversationId);
  const { data, error } = await admin
    .from('agent_messages')
    .select('id, seq, role, parts, message_status, duration_ms')
    .eq('conversation_id', conversation.id)
    .eq('user_id', userId)
    .eq('deleted', false)
    .gt('seq', conversation.summarizedUntilSeq)
    .order('seq', { ascending: true });
  if (error) throw error;
  return { conversation, recent: (data ?? []).map(toStored) };
}

/** Full history for display (paged by seq). */
export async function listMessages(admin: SupabaseClient, userId: string, conversationId: string, beforeSeq?: number, limit = 50) {
  let q = admin
    .from('agent_messages')
    .select('id, seq, role, parts, message_status, duration_ms, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('seq', { ascending: false })
    .limit(limit);
  if (beforeSeq != null) q = q.lt('seq', beforeSeq);
  // Ownership check and the message query run in parallel (the query filters by user too).
  const [, { data, error }] = await Promise.all([getConversation(admin, userId, conversationId), q]);
  if (error) throw error;
  return (data ?? []).reverse().map((r) => ({ ...toStored(r), createdAt: r.created_at as string }));
}

export async function insertUserMessage(admin: SupabaseClient, conversation: Conversation, message: UIMessage): Promise<StoredMessage> {
  const { data, error } = await admin
    .from('agent_messages')
    .insert({
      id: message.id,
      conversation_id: conversation.id,
      user_id: conversation.userId,
      role: 'user',
      content: plainText(message),
      parts: message.parts,
    })
    .select('id, seq, role, parts, message_status, duration_ms')
    .single();
  if (error) throw error;
  await touchConversation(admin, conversation.id);
  return toStored(data);
}

/** Insert a new assistant message, or update it when a tool approval continued it. */
export async function saveAssistantMessage(
  admin: SupabaseClient,
  conversation: Conversation,
  message: UIMessage,
  fields: { status: MessageStatus; replyTo: string | null; durationMs: number; model: string; usage?: unknown },
) {
  const { error } = await admin.from('agent_messages').upsert(
    {
      id: message.id,
      conversation_id: conversation.id,
      user_id: conversation.userId,
      role: 'assistant',
      content: plainText(message),
      parts: message.parts,
      reply_to_message_id: fields.replyTo,
      message_status: fields.status,
      duration_ms: fields.durationMs,
      model: fields.model,
      usage: fields.usage ?? null,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
  await touchConversation(admin, conversation.id);
}

/**
 * Claim a message that waits for approval: AWAITING_APPROVAL → NORMAL with the
 * user's answers written into its parts. Conditional, so a double click cannot
 * run the same tool twice. Returns false if someone else claimed it first.
 */
export async function claimApprovalMessage(
  admin: SupabaseClient,
  conversation: Conversation,
  messageId: string,
  parts: UIMessage['parts'],
  stillPending: boolean,
): Promise<boolean> {
  const { data, error } = await admin
    .from('agent_messages')
    .update({ parts, message_status: stillPending ? 'AWAITING_APPROVAL' : 'NORMAL' })
    .eq('id', messageId)
    .eq('conversation_id', conversation.id)
    .eq('user_id', conversation.userId)
    .eq('message_status', 'AWAITING_APPROVAL')
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** The user moved on without answering: pending approvals are dropped (the model never sees them). */
export async function expirePendingApprovals(admin: SupabaseClient, conversation: Conversation) {
  const { error } = await admin
    .from('agent_messages')
    .update({ message_status: 'INTERRUPTED' })
    .eq('conversation_id', conversation.id)
    .eq('user_id', conversation.userId)
    .eq('message_status', 'AWAITING_APPROVAL');
  if (error) throw error;
}
