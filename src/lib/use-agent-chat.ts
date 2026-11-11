'use client';

import { useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai';
import { AgentChatError, type AgentAuth } from './agent-chat';

export interface UseAgentChatOptions {
  conversationId: string | null;
  initialMessages: UIMessage[];
  /** Bearer auth for the mobile WebView; omitted on the dashboard (cookie). */
  auth?: AgentAuth;
  /** The server created the conversation for a new chat (X-Conversation-Id). */
  onConversationCreated?: (id: string) => void;
  /** After every assistant turn. */
  onTurnFinished?: () => void;
  /** Generated title of a new conversation (transient data event). */
  onTitle?: (conversationId: string, title: string) => void;
  /** A request was rejected with 401 (e.g. the token expired). */
  onUnauthorized?: () => void;
  /** A request was rejected with 403 (e.g. a new AI notice or Terms of Use must be accepted first). */
  onForbidden?: () => void;
  /** Batch UI updates while streaming (ms); fewer re-renders on slow phones. */
  throttleMs?: number;
}

export const messageText = (m: UIMessage) =>
  m.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');

/**
 * useChat wired to /api/agent/chat. Our API takes one new message (or the
 * approval answers), not the whole history: the server rebuilds the context.
 */
export function useAgentChat(opts: UseAgentChatOptions) {
  const convRef = useRef<string | null>(opts.conversationId);
  /** approvalId → message the user edited in the care-team confirmation. */
  const edits = useRef(new Map<string, string>());
  const latest = useRef(opts);
  latest.current = opts;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/agent/chat',
        credentials: opts.auth ? 'omit' : 'same-origin',
        headers: async () => (latest.current.auth ? await latest.current.auth() : {}),
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const id = res.headers.get('X-Conversation-Id');
          if (id && !convRef.current) {
            convRef.current = id;
            latest.current.onConversationCreated?.(id);
          }
          if (!res.ok) {
            if (res.status === 401) latest.current.onUnauthorized?.();
            if (res.status === 403) latest.current.onForbidden?.();
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            // Carries the status, so the patient chat can show its own wording.
            throw new AgentChatError(body?.error ?? `Request failed (${res.status}).`, res.status);
          }
          return res;
        },
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            const approvals = last.parts.flatMap((p) =>
              isToolUIPart(p) && p.state === 'approval-responded'
                ? [
                    {
                      approvalId: p.approval.id,
                      approved: p.approval.approved,
                      ...(p.approval.reason ? { reason: p.approval.reason } : {}),
                      ...(p.approval.approved && edits.current.get(p.approval.id) ? { editedMessage: edits.current.get(p.approval.id) } : {}),
                    },
                  ]
                : [],
            );
            return { body: { conversationId: convRef.current, approvals } };
          }
          return { body: { ...(convRef.current ? { conversationId: convRef.current } : {}), message: last ? messageText(last) : '' } };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const chat = useChat({
    ...(opts.throttleMs ? { throttle: opts.throttleMs } : {}),
    messages: opts.initialMessages,
    transport,
    // After the user answers every waiting approval, continue the turn automatically.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => latest.current.onTurnFinished?.(),
    onData: (part) => {
      if (part.type !== 'data-conversation-title') return;
      const d = part.data as { conversationId?: string; title?: string } | undefined;
      if (d?.conversationId && d.title) latest.current.onTitle?.(d.conversationId, d.title);
    },
  });

  const busy = chat.status === 'submitted' || chat.status === 'streaming';

  /** Answer a waiting tool call; `editedMessage` replaces the AI's draft (care-team messages). */
  const answerApproval = (approvalId: string, approved: boolean, editedMessage?: string) => {
    const text = editedMessage?.trim();
    if (approved && text) edits.current.set(approvalId, text);
    else edits.current.delete(approvalId);
    return chat.addToolApprovalResponse({
      id: approvalId,
      approved,
      ...(approved ? {} : { reason: 'The user chose not to send it.' }),
    });
  };

  return { ...chat, busy, answerApproval };
}

/** The tool call on the last message that waits for the user's answer, if any. */
export function pendingApproval(messages: UIMessage[]) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  for (const p of last.parts) {
    if (isToolUIPart(p) && p.state === 'approval-requested') return p;
  }
  return null;
}
