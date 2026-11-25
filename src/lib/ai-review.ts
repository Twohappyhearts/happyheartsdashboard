import type { AgentHistoryMessage } from '@/lib/agent-chat';

/**
 * Client helpers for the AI Conversations page (/api/admin/ai-conversations): the research team
 * reads everyone's AI assistant conversations (patients and Careteam/Admin test chats).
 * Read-only; each opened conversation is recorded in the audit log by the server.
 */

export type ReviewRole = 'patient' | 'staff' | 'admin';

export interface ReviewUser {
  id: string;
  role: ReviewRole | null;
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

/** The owner's rating of one answer (either score may be empty). */
export interface ReviewRating {
  messageId: string;
  /** 1-5, 5 best. */
  usability: number | null;
  /** 3 safe, 2 concern, 1 unsafe. */
  safety: number | null;
  comment: string;
}

export interface ReviewThread {
  conversation: ReviewConversation;
  messages: AgentHistoryMessage[];
  ratings: ReviewRating[];
}

export class ReviewError extends Error {}

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ReviewError('Could not reach the server.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new ReviewError(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

/** One page of conversations, newest activity first; pass `next` of a page to get the one after. */
export function listReviewConversations(search: string, role: ReviewRole | null, before: string | null) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (role) params.set('role', role);
  if (before) params.set('before', before);
  return get<{ conversations: ReviewConversation[]; next: string | null }>(`/api/admin/ai-conversations?${params}`);
}

/** A conversation as its owner has it on screen, or with `version` the newest branch under that message. */
export function openReviewConversation(conversationId: string, version?: string) {
  const query = version ? `?version=${encodeURIComponent(version)}` : '';
  return get<ReviewThread>(`/api/admin/ai-conversations/${encodeURIComponent(conversationId)}${query}`);
}

export const reviewUserName = (u: ReviewUser, unknown: string) =>
  u.fullName || (u.username ? `@${u.username}` : unknown);
