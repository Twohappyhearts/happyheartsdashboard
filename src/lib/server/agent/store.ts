import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isToolUIPart, type UIMessage } from 'ai';
import { ApiError } from '@/lib/server/staff-auth';

/**
 * Persistence for the agent. Everything goes through the service-role client,
 * so every function takes the caller's userId and filters by it.
 *
 * A conversation is a tree of messages (migration 20261124000100_agent_message_branches.sql):
 * every message points to the one before it (parent_id), and editing a user message adds a
 * sibling (same parent) that starts a new branch. The conversation remembers the last message of
 * the branch on screen (current_leaf_id); the agent and the history API use the path from the
 * first message to that leaf. Summaries are anchored at a message (agent_summaries) and apply to
 * every branch that passes through it.
 */

export type MessageStatus = 'NORMAL' | 'INTERRUPTED' | 'AWAITING_APPROVAL' | 'ERROR';

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  /** Summary of the branch on screen up to `summaryThroughId` (set by loadState). */
  summary: string | null;
  summaryThroughId: string | null;
  /** Last message of the branch on screen. */
  currentLeafId: string | null;
  state: Record<string, unknown>;
}

export interface StoredMessage {
  seq: number;
  status: MessageStatus;
  durationMs: number | null;
  parentId: string | null;
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
  summary: null,
  summaryThroughId: null,
  currentLeafId: r.current_leaf_id ?? null,
  state: (r.state ?? {}) as Record<string, unknown>,
});

const toStored = (r: Row): StoredMessage => ({
  seq: Number(r.seq),
  status: r.message_status as MessageStatus,
  durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
  parentId: r.parent_id ?? null,
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

/**
 * Save a summary of the branch from its first message through `throughMessageId`. Another
 * request that summarized the same messages concurrently wins (same result); returns false then.
 */
export async function saveSummary(
  admin: SupabaseClient,
  conversation: Conversation,
  summary: string,
  throughMessageId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('agent_summaries')
    .upsert(
      { conversation_id: conversation.id, through_message_id: throughMessageId, summary },
      { onConflict: 'conversation_id,through_message_id', ignoreDuplicates: true },
    )
    .select('through_message_id');
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

// ---------------------------------------------------------------- the message tree

const MESSAGE_COLUMNS = 'id, seq, role, parts, message_status, duration_ms, parent_id, created_at';

interface TreeNode {
  id: string;
  parentId: string | null;
  role: string;
  seq: number;
}

/** The ids and links of every message in a conversation (small rows: the tree's skeleton). */
async function loadTree(admin: SupabaseClient, userId: string, conversationId: string): Promise<TreeNode[]> {
  const { data, error } = await admin
    .from('agent_messages')
    .select('id, parent_id, role, seq')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .eq('deleted', false)
    .order('seq', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id as string, parentId: (r.parent_id as string | null) ?? null, role: r.role as string, seq: Number(r.seq) }));
}

/** Children of each message (null key: first messages), oldest first. */
function childrenOf(tree: TreeNode[]): Map<string | null, TreeNode[]> {
  const map = new Map<string | null, TreeNode[]>();
  for (const n of tree) {
    const list = map.get(n.parentId) ?? [];
    list.push(n);
    map.set(n.parentId, list);
  }
  return map;
}

/** Message ids from the first message to `leafId`. */
function pathTo(tree: TreeNode[], leafId: string | null): string[] {
  const byId = new Map(tree.map((n) => [n.id, n]));
  // No leaf yet (or it was removed): the newest message stands in.
  let node: TreeNode | undefined = (leafId ? byId.get(leafId) : undefined) ?? tree[tree.length - 1];
  const path: string[] = [];
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.push(node.id);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return path.reverse();
}

/** The leaf a version opens: follow the newest child down from `messageId`. */
function newestLeafUnder(children: Map<string | null, TreeNode[]>, messageId: string): string {
  let id = messageId;
  for (;;) {
    const kids = children.get(id);
    if (!kids?.length) return id;
    id = kids[kids.length - 1].id;
  }
}

async function loadMessages(admin: SupabaseClient, userId: string, ids: string[]): Promise<Map<string, Row>> {
  const rows = new Map<string, Row>();
  // In chunks: the ids go in the request URL.
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from('agent_messages')
      .select(MESSAGE_COLUMNS)
      .eq('user_id', userId)
      .in('id', ids.slice(i, i + 100));
    if (error) throw error;
    for (const r of data ?? []) rows.set(r.id as string, r);
  }
  return rows;
}

async function setCurrentLeaf(admin: SupabaseClient, conversation: Conversation, leafId: string, onlyIfLeafIs?: string | null) {
  let q = admin.from('agent_conversations').update({ current_leaf_id: leafId }).eq('id', conversation.id).eq('user_id', conversation.userId);
  // Conditional: a reply that finishes after the user switched to another version does not
  // switch them back.
  if (onlyIfLeafIs !== undefined) q = onlyIfLeafIs === null ? q.is('current_leaf_id', null) : q.eq('current_leaf_id', onlyIfLeafIs);
  const { error } = await q;
  if (error) throw error;
}

// ---------------------------------------------------------------- messages

/**
 * The branch on screen for the agent: the conversation with the summary that applies to this
 * branch, and the messages of the branch after that summary.
 */
export async function loadState(admin: SupabaseClient, userId: string, conversationId: string): Promise<AgentState> {
  const conversation = await getConversation(admin, userId, conversationId);
  const tree = await loadTree(admin, userId, conversation.id);
  const path = pathTo(tree, conversation.currentLeafId);

  // The summary anchored furthest along this branch.
  let from = 0;
  if (path.length) {
    const { data, error } = await admin
      .from('agent_summaries')
      .select('through_message_id, summary')
      .eq('conversation_id', conversation.id);
    if (error) throw error;
    const index = new Map(path.map((id, i) => [id, i]));
    let best: { i: number; summary: string } | null = null;
    for (const r of data ?? []) {
      const i = index.get(r.through_message_id as string);
      if (i != null && (!best || i > best.i)) best = { i, summary: r.summary as string };
    }
    if (best) {
      conversation.summary = best.summary;
      conversation.summaryThroughId = path[best.i];
      from = best.i + 1;
    }
  }

  const ids = path.slice(from);
  const rows = await loadMessages(admin, userId, ids);
  return { conversation, recent: ids.flatMap((id) => (rows.has(id) ? [toStored(rows.get(id)!)] : [])) };
}

/** A message of the branch on screen, for display, with its versions (siblings, oldest first). */
export interface PathMessage extends StoredMessage {
  createdAt: string;
  siblingIds: string[];
}

/** The branch ending at `leafId` for display: its last `limit` messages, oldest first. */
async function branchForDisplay(
  admin: SupabaseClient,
  userId: string,
  tree: TreeNode[],
  leafId: string | null,
  limit: number,
): Promise<PathMessage[]> {
  const children = childrenOf(tree);
  const byId = new Map(tree.map((n) => [n.id, n]));
  const ids = pathTo(tree, leafId).slice(-limit);
  const rows = await loadMessages(admin, userId, ids);
  return ids.flatMap((id) => {
    const r = rows.get(id);
    if (!r) return [];
    const node = byId.get(id)!;
    const siblingIds = (children.get(node.parentId) ?? []).filter((n) => n.role === node.role).map((n) => n.id);
    return [{ ...toStored(r), createdAt: r.created_at as string, siblingIds }];
  });
}

/** The branch on screen for display: its last `limit` messages, oldest first. */
export async function listMessages(admin: SupabaseClient, userId: string, conversationId: string, limit = 100): Promise<PathMessage[]> {
  const conversation = await getConversation(admin, userId, conversationId);
  const tree = await loadTree(admin, userId, conversation.id);
  return branchForDisplay(admin, userId, tree, conversation.currentLeafId, limit);
}

/**
 * Read-only view for reviewers (research team): the branch on screen, or with `versionId` the
 * newest branch under that version, as switchBranch would show it, but without changing the
 * owner's current_leaf_id.
 */
export async function viewBranch(
  admin: SupabaseClient,
  conversation: Conversation,
  versionId: string | null,
  limit = 500,
): Promise<PathMessage[]> {
  const tree = await loadTree(admin, conversation.userId, conversation.id);
  if (versionId && !tree.some((n) => n.id === versionId)) throw new ApiError(404, 'Message not found.');
  const leaf = versionId ? newestLeafUnder(childrenOf(tree), versionId) : conversation.currentLeafId;
  return branchForDisplay(admin, conversation.userId, tree, leaf, limit);
}

/**
 * Show another version: the branch on screen becomes the newest one under `messageId` (one of
 * the versions of a message on the current branch). Returns the new branch for display.
 */
export async function switchBranch(admin: SupabaseClient, userId: string, conversationId: string, messageId: string, limit = 100) {
  const conversation = await getConversation(admin, userId, conversationId);
  const tree = await loadTree(admin, userId, conversation.id);
  if (!tree.some((n) => n.id === messageId)) throw new ApiError(404, 'Message not found.');
  await setCurrentLeaf(admin, conversation, newestLeafUnder(childrenOf(tree), messageId));
  return listMessages(admin, userId, conversationId, limit);
}

/**
 * The parent for a new user message: after the branch on screen, or, when the user edits
 * message `editOf`, the same parent as that message (the new message is its next version).
 */
export async function parentForNewMessage(admin: SupabaseClient, conversation: Conversation, editOf?: string): Promise<string | null> {
  if (!editOf) {
    if (conversation.currentLeafId) return conversation.currentLeafId;
    const tree = await loadTree(admin, conversation.userId, conversation.id);
    return tree.length ? tree[tree.length - 1].id : null;
  }
  const { data, error } = await admin
    .from('agent_messages')
    .select('parent_id')
    .eq('id', editOf)
    .eq('conversation_id', conversation.id)
    .eq('user_id', conversation.userId)
    .eq('role', 'user')
    .eq('deleted', false)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'The message to edit was not found.');
  return (data.parent_id as string | null) ?? null;
}

/** Add the user's message after `parentId`; the branch on screen now ends with it. */
export async function insertUserMessage(
  admin: SupabaseClient,
  conversation: Conversation,
  message: UIMessage,
  parentId: string | null,
): Promise<StoredMessage> {
  const { data, error } = await admin
    .from('agent_messages')
    .insert({
      id: message.id,
      conversation_id: conversation.id,
      user_id: conversation.userId,
      role: 'user',
      content: plainText(message),
      parts: message.parts,
      parent_id: parentId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  await setCurrentLeaf(admin, conversation, message.id);
  conversation.currentLeafId = message.id;
  await touchConversation(admin, conversation.id);
  return toStored(data);
}

/**
 * Insert a new assistant message (after the user message it answers), or update it when a tool
 * approval continued it. The branch on screen moves to it unless the user switched away meanwhile.
 */
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
      parent_id: fields.replyTo,
      message_status: fields.status,
      duration_ms: fields.durationMs,
      model: fields.model,
      usage: fields.usage ?? null,
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
  if (fields.replyTo) await setCurrentLeaf(admin, conversation, message.id, fields.replyTo);
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

export interface AnswerRating {
  messageId: string;
  /** 1-5; null until the tester picks it. */
  usability: number | null;
  /** 1-3; null until the tester picks it. */
  safety: number | null;
  comment: string;
}

/** A change to one rating: only the fields present are changed (null clears a score). */
export interface AnswerRatingChange {
  messageId: string;
  usability?: number | null;
  safety?: number | null;
  comment?: string;
}

const toRating = (r: Row): AnswerRating => ({
  messageId: r.message_id,
  usability: r.usability ?? null,
  safety: r.safety ?? null,
  comment: r.comment ?? '',
});

/** The caller's ratings of the answers in one conversation. */
export async function listAnswerRatings(admin: SupabaseClient, userId: string, conversationId: string): Promise<AnswerRating[]> {
  const { data, error } = await admin
    .from('agent_answer_ratings')
    .select('message_id, usability, safety, comment')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toRating);
}

/**
 * Change the caller's rating of one of their own assistant answers. Each score is saved as soon
 * as it is picked (the other may still be empty); the comment is saved on its own. When both
 * scores end up empty the rating is deleted. Returns the rating as saved, or null if deleted.
 */
export async function saveAnswerRating(
  admin: SupabaseClient,
  userId: string,
  change: AnswerRatingChange,
): Promise<AnswerRating | null> {
  const { data: message, error: lookupError } = await admin
    .from('agent_messages')
    .select('conversation_id')
    .eq('id', change.messageId)
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .eq('deleted', false)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!message) throw new ApiError(404, 'Answer not found.');

  const { data: current, error: readError } = await admin
    .from('agent_answer_ratings')
    .select('message_id, usability, safety, comment')
    .eq('message_id', change.messageId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;
  const before = current ? toRating(current as Row) : null;
  const next: AnswerRating = {
    messageId: change.messageId,
    usability: change.usability !== undefined ? change.usability : (before?.usability ?? null),
    safety: change.safety !== undefined ? change.safety : (before?.safety ?? null),
    comment: change.comment !== undefined ? change.comment : (before?.comment ?? ''),
  };

  if (next.usability == null && next.safety == null) {
    const { error } = await admin.from('agent_answer_ratings').delete().eq('message_id', change.messageId).eq('user_id', userId);
    if (error) throw error;
    return null;
  }
  const { error } = await admin.from('agent_answer_ratings').upsert(
    {
      message_id: change.messageId,
      conversation_id: (message as Row).conversation_id,
      user_id: userId,
      usability: next.usability,
      safety: next.safety,
      comment: next.comment,
    },
    { onConflict: 'message_id,user_id' },
  );
  if (error) throw error;
  return next;
}
