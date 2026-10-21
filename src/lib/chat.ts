import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/**
 * Staff-side chat data access. Mirrors happyhearts/lib/services/chat_service.dart.
 * The database (trigger + RLS) decides sender_id / sender_role / created_at, so
 * clients only ever send { id, conversation_id, content }.
 */

export const MAX_MESSAGE_LENGTH = 4000;
export const PAGE_SIZE = 30;
const COLUMNS = 'id, conversation_id, sender_id, sender_role, content, created_at';

export type SendState = 'sent' | 'pending' | 'failed';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: 'user' | 'team';
  content: string;
  createdAt: string; // ISO (UTC from server)
  state: SendState;
}

export interface Patient {
  id: string;
  fullName: string;
  username: string;
}

export interface ConversationSummary {
  id: string;
  patient: Patient;
  lastMessageAt: string | null;
  lastMessage: ChatMessage | null;
}

export interface PatientListItem extends Patient {
  conversationId: string | null;
  lastMessageAt: string | null;
}

export class ChatError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** Thrown when migration 20261019000600_staff_chat_helpers.sql has not been applied. */
export class MissingMigrationError extends ChatError {}

type Row = Record<string, unknown>;

export function toMessage(r: Row, state: SendState = 'sent'): ChatMessage {
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    senderId: (r.sender_id as string | null) ?? null,
    senderRole: r.sender_role === 'team' ? 'team' : 'user',
    content: String(r.content ?? ''),
    createdAt: String(r.created_at),
    state,
  };
}

/** Ascending by (createdAt, id) — same stable order as the mobile app. */
export function compareMessages(a: ChatMessage, b: ChatMessage) {
  const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function pgError(e: { code?: string; message?: string } | null, fallback: string): ChatError {
  if (!e) return new ChatError(fallback);
  if (e.code === 'PGRST202' || e.code === '42883') {
    return new MissingMigrationError(
      'Database function missing. Run supabase/migrations/20261019000600_staff_chat_helpers.sql in the Supabase SQL Editor.',
      e.code
    );
  }
  if (e.code === '42501') return new ChatError('Your account does not have staff permission for this.', e.code);
  if (e.code === '23514') return new ChatError(`Messages must be 1–${MAX_MESSAGE_LENGTH} characters.`, e.code);
  return new ChatError(`${fallback}: ${e.message ?? 'unknown error'}`, e.code);
}

function toPatient(raw: unknown, fallbackId: string): Patient {
  const p = (Array.isArray(raw) ? raw[0] : raw) as Row | null | undefined;
  return {
    id: (p?.id as string) ?? fallbackId,
    fullName: ((p?.full_name as string) ?? '').trim(),
    username: (p?.username as string) ?? '',
  };
}

export async function listConversations(supabase: SupabaseClient): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, patient_id, last_message_at, patient:profiles(id, full_name, username)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw pgError(error, 'Could not load conversations');

  const rows = (data ?? []) as Row[];
  const previews = await Promise.all(
    rows.map(async (r) => {
      const { data: last } = await supabase
        .from('chat_messages')
        .select(COLUMNS)
        .eq('conversation_id', r.id as string)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      return last ? toMessage(last as Row) : null;
    })
  );

  return rows.map((r, i) => ({
    id: String(r.id),
    patient: toPatient(r.patient, String(r.patient_id)),
    lastMessageAt: (r.last_message_at as string | null) ?? previews[i]?.createdAt ?? null,
    lastMessage: previews[i],
  }));
}

export async function getConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationSummary | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, patient_id, last_message_at, patient:profiles(id, full_name, username)')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw pgError(error, 'Could not load conversation');
  if (!data) return null;
  const r = data as Row;
  return {
    id: String(r.id),
    patient: toPatient(r.patient, String(r.patient_id)),
    lastMessageAt: (r.last_message_at as string | null) ?? null,
    lastMessage: null,
  };
}

/** Newest-first keyset pagination on (created_at, id); returned ascending. */
export async function fetchPage(
  supabase: SupabaseClient,
  conversationId: string,
  before?: ChatMessage
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  let q = supabase.from('chat_messages').select(COLUMNS).eq('conversation_id', conversationId);
  if (before) {
    const ts = new Date(before.createdAt).toISOString();
    q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${before.id})`);
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw pgError(error, 'Could not load messages');
  const rows = (data ?? []) as Row[];
  return { messages: rows.map((r) => toMessage(r)).reverse(), hasMore: rows.length >= PAGE_SIZE };
}

/** Messages at/after `after` — used to recover anything missed while disconnected. */
export async function fetchSince(
  supabase: SupabaseClient,
  conversationId: string,
  after: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(COLUMNS)
    .eq('conversation_id', conversationId)
    .gte('created_at', after)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(200);
  if (error) throw pgError(error, 'Could not load messages');
  return ((data ?? []) as Row[]).map((r) => toMessage(r));
}

/**
 * Insert with a client-generated id, so a retry can never create a duplicate.
 * A duplicate-key error on retry means the first attempt actually succeeded.
 */
export async function sendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  messageId: string,
  content: string
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ id: messageId, conversation_id: conversationId, content })
    .select(COLUMNS)
    .single();
  if (!error && data) return toMessage(data as Row);

  if (error?.code === '23505') {
    const { data: existing } = await supabase
      .from('chat_messages')
      .select(COLUMNS)
      .eq('id', messageId)
      .maybeSingle();
    if (existing) return toMessage(existing as Row);
  }
  throw pgError(error, 'Message not sent');
}

export async function listPatients(supabase: SupabaseClient): Promise<PatientListItem[]> {
  const { data, error } = await supabase.rpc('staff_list_patients');
  if (error) throw pgError(error, 'Could not load patients');
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    fullName: ((r.full_name as string) ?? '').trim(),
    username: (r.username as string) ?? '',
    conversationId: (r.conversation_id as string | null) ?? null,
    lastMessageAt: (r.last_message_at as string | null) ?? null,
  }));
}

export async function openConversationForPatient(
  supabase: SupabaseClient,
  patientId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('staff_get_or_create_conversation', {
    p_patient_id: patientId,
  });
  if (error) throw pgError(error, 'Could not open conversation');
  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  if (!row?.id) throw new ChatError('Could not open conversation.');
  return String(row.id);
}

/** Names for staff authors of team messages (staff can read all profiles). */
export async function fetchProfiles(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Patient[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.from('profiles').select('id, full_name, username').in('id', ids);
  return ((data ?? []) as Row[]).map((r) => toPatient(r, String(r.id)));
}

/** One channel for every conversation; RLS limits delivery to what staff may read. */
export function subscribeToAllMessages(
  supabase: SupabaseClient,
  key: string,
  onInsert: (m: ChatMessage) => void,
  onStatus: (connected: boolean) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`staff-chat:${key}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload) => {
        try {
          const m = toMessage(payload.new as Row);
          if (m.conversationId && m.conversationId !== 'null') onInsert(m);
        } catch {
          /* ignore malformed payloads */
        }
      }
    )
    .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
  return channel;
}

export function newMessageId(): string {
  const c = globalThis.crypto as Crypto;
  // randomUUID only exists in secure contexts (https / localhost).
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function patientName(p: Patient) {
  return p.fullName || (p.username ? `@${p.username}` : 'Unknown patient');
}
