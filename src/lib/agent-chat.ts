import type { UIMessage } from 'ai';

/**
 * Client helpers for the AI assistant API (/api/agent/*).
 * Dashboard: same-origin session cookie. Mobile app WebView: `auth` returns a
 * Bearer header with the patient's Supabase access token.
 */

export interface AgentConversation {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export type AgentMessageStatus = 'NORMAL' | 'INTERRUPTED' | 'AWAITING_APPROVAL' | 'ERROR';

export type AgentHistoryMessage = UIMessage & { seq: number; status: AgentMessageStatus; createdAt: string };

/** Extra request headers (e.g. Authorization), resolved per request. */
export type AgentAuth = () => Promise<Record<string, string>>;

export class AgentChatError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit, auth?: AgentAuth): Promise<T> {
  let res: Response;
  try {
    const headers = auth ? await auth() : {};
    res = await fetch(url, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      credentials: auth ? 'omit' : 'same-origin',
      cache: 'no-store',
    });
  } catch (e) {
    if (e instanceof AgentChatError) throw e;
    throw new AgentChatError('Could not reach the server.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new AgentChatError(body?.error ?? `Request failed (${res.status}).`, res.status);
  return body;
}

export async function listAgentConversations(auth?: AgentAuth): Promise<AgentConversation[]> {
  return (await request<{ conversations: AgentConversation[] }>('/api/agent/conversations', {}, auth)).conversations;
}

/** The latest messages of a conversation (oldest first). */
export async function loadAgentMessages(conversationId: string, auth?: AgentAuth, limit = 100) {
  return request<{ messages: AgentHistoryMessage[]; nextBefore: number | null }>(
    `/api/agent/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
    {},
    auth,
  );
}

export async function deleteAgentConversation(conversationId: string, auth?: AgentAuth): Promise<void> {
  await request<{ ok: boolean }>(`/api/agent/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }, auth);
}

export const conversationTitle = (c: Pick<AgentConversation, 'title'>) => c.title?.trim() || 'New conversation';

export const historyToUIMessages = (messages: AgentHistoryMessage[]): UIMessage[] =>
  messages.map(({ id, role, parts }) => ({ id, role, parts }) as UIMessage);
