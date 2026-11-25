'use client';

import { useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai';
import { AgentChatError, historyToUIMessages, siblingIdsOf, switchAgentBranch } from './agent-chat';

export interface UseAgentChatOptions {
  conversationId: string | null;
  initialMessages: UIMessage[];
  /** The server created the conversation for a new chat (X-Conversation-Id). */
  onConversationCreated?: (id: string) => void;
  /** After every assistant turn. */
  onTurnFinished?: () => void;
  /** Generated title of a new conversation (transient data event). */
  onTitle?: (conversationId: string, title: string) => void;
}

export const messageText = (m: UIMessage) =>
  m.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');

/**
 * useChat wired to /api/agent/chat. Our API takes one new message (or the
 * approval answers), not the whole history: the server rebuilds the context.
 *
 * Editing a message: the chat drops it and everything after it, and the next request carries
 * `editOf`; the server stores the new text as another version (a new branch). The server's id
 * for the user message comes back in X-User-Message-Id and replaces the local one, so the
 * message can be edited or switched later.
 */
export function useAgentChat(opts: UseAgentChatOptions) {
  const convRef = useRef<string | null>(opts.conversationId);
  const latest = useRef(opts);
  latest.current = opts;
  /** The message the next request replaces, and the versions it had. */
  const editRef = useRef<{ id: string; siblingIds: string[] } | null>(null);
  const setMessagesRef = useRef<((update: (m: UIMessage[]) => UIMessage[]) => void) | null>(null);
  const [switching, setSwitching] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/agent/chat',
        credentials: 'same-origin',
        fetch: async (input, init) => {
          // The body (with editOf) is already built; the edit is used up by this request.
          const edited = editRef.current;
          editRef.current = null;
          const res = await fetch(input, init);
          const id = res.headers.get('X-Conversation-Id');
          if (id && !convRef.current) {
            convRef.current = id;
            latest.current.onConversationCreated?.(id);
          }
          const userId = res.headers.get('X-User-Message-Id');
          if (userId) {
            // The last user message is the one just sent: give it the server's id and versions.
            setMessagesRef.current?.((ms) => {
              const i = ms.map((m) => m.role).lastIndexOf('user');
              if (i < 0) return ms;
              const siblingIds = edited ? [...edited.siblingIds, userId] : [userId];
              const next = [...ms];
              next[i] = { ...ms[i], id: userId, metadata: { siblingIds } };
              return next;
            });
          }
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
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
                    },
                  ]
                : [],
            );
            return { body: { conversationId: convRef.current, approvals } };
          }
          return {
            body: {
              ...(convRef.current ? { conversationId: convRef.current } : {}),
              message: last ? messageText(last) : '',
              ...(editRef.current ? { editOf: editRef.current.id } : {}),
            },
          };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const chat = useChat({
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

  setMessagesRef.current = (update) => chat.setMessages(update);
  const busy = chat.status === 'submitted' || chat.status === 'streaming' || switching;

  /** Send `text` as a new version of user message `messageId` (a new branch from there). */
  const editMessage = (messageId: string, text: string) => {
    const i = chat.messages.findIndex((m) => m.id === messageId);
    if (i < 0 || busy || !text.trim()) return;
    editRef.current = { id: messageId, siblingIds: siblingIdsOf(chat.messages[i]) };
    chat.setMessages(chat.messages.slice(0, i));
    void chat.sendMessage({ text: text.trim() });
  };

  /** Show another version of a message: the branch under it replaces what is on screen. */
  const switchVersion = async (messageId: string) => {
    const conversationId = convRef.current;
    if (!conversationId || busy) return;
    setSwitching(true);
    try {
      chat.setMessages(historyToUIMessages(await switchAgentBranch(conversationId, messageId)));
    } finally {
      setSwitching(false);
    }
  };

  /**
   * Answer a waiting tool call. No tool needs approval at the moment (the care-team offer was
   * removed on 2026-11-23); kept for tools that will.
   */
  const answerApproval = (approvalId: string, approved: boolean) =>
    chat.addToolApprovalResponse({
      id: approvalId,
      approved,
      ...(approved ? {} : { reason: 'The user declined.' }),
    });

  return { ...chat, busy, answerApproval, editMessage, switchVersion };
}
