import type { UIMessage } from 'ai';

/**
 * Client helpers for the AI assistant API (/api/agent/*) used by the dashboard's AI Chat
 * (session cookie). The mobile app calls the same API natively with a Bearer token.
 */

export interface AgentConversation {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export type AgentMessageStatus = 'NORMAL' | 'INTERRUPTED' | 'AWAITING_APPROVAL' | 'ERROR';

export type AgentHistoryMessage = UIMessage & {
  seq: number;
  status: AgentMessageStatus;
  createdAt: string;
  parentId: string | null;
  /** Versions of this message (itself included), oldest first. */
  siblingIds: string[];
};

export class AgentChatError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new AgentChatError('Could not reach the server.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new AgentChatError(body?.error ?? `Request failed (${res.status}).`, res.status);
  return body;
}

export async function listAgentConversations(): Promise<AgentConversation[]> {
  return (await request<{ conversations: AgentConversation[] }>('/api/agent/conversations')).conversations;
}

/** The latest messages of a conversation (oldest first). */
export async function loadAgentMessages(conversationId: string, limit = 100) {
  return request<{ messages: AgentHistoryMessage[]; nextBefore: number | null }>(
    `/api/agent/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
  );
}

export async function deleteAgentConversation(conversationId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/agent/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
}

/** Message metadata in the chat: the versions of the message (itself included), oldest first. */
export interface AgentMessageMeta {
  siblingIds: string[];
}

export const siblingIdsOf = (m: UIMessage): string[] => (m.metadata as AgentMessageMeta | undefined)?.siblingIds ?? [m.id];

export const historyToUIMessages = (messages: AgentHistoryMessage[]): UIMessage[] =>
  messages.map(({ id, role, parts, siblingIds }) => ({ id, role, parts, metadata: { siblingIds: siblingIds ?? [id] } }) as UIMessage);

/** Show another version of a message (one of its siblingIds); returns the branch now on screen. */
export async function switchAgentBranch(conversationId: string, messageId: string): Promise<AgentHistoryMessage[]> {
  return (
    await request<{ messages: AgentHistoryMessage[] }>(`/api/agent/conversations/${encodeURIComponent(conversationId)}/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    })
  ).messages;
}

/** Short-lived link (about 10 minutes) to the original file of a cited knowledge-base document. */
export const getAgentDocumentUrl = (documentId: string) =>
  request<{ url: string }>(`/api/agent/sources/${encodeURIComponent(documentId)}`);

/**
 * Open the original file of a cited knowledge-base document in a new tab. The tab opens right
 * away (inside the click, so pop-up blockers allow it) and gets its address when the link arrives.
 */
export async function openAgentDocument(documentId: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { url } = await getAgentDocumentUrl(documentId);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    tab?.close();
    throw e;
  }
}
