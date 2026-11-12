'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import EmptyState from '@/components/ui/EmptyState';
import { initials } from '@/contexts/AuthContext';
import { compareMessages, MAX_MESSAGE_LENGTH, patientName, type ChatMessage, type ConversationSummary } from '@/lib/chat';
import type { ThreadState } from './MessagesClient';
import { dayKey, formatDayLabel, formatMessageTime } from './format';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  conversation: ConversationSummary | undefined;
  conversationId: string | null;
  thread: ThreadState | undefined;
  myId: string | null;
  myName: string;
  names: Record<string, string>;
  failReasons: Record<string, string>;
  connected: boolean;
  onSend: (conversationId: string, text: string) => void;
  onRetry: (m: ChatMessage) => void;
  onLoadOlder: (conversationId: string) => void;
  onReload: (conversationId: string) => void;
  onNewChat: () => void;
}

export default function ChatThread({
  conversation,
  conversationId,
  thread,
  myId,
  myName,
  names,
  failReasons,
  connected,
  onSend,
  onRetry,
  onLoadOlder,
  onReload,
  onNewChat,
}: Props) {
  const { t, locale } = useStaffT();
  const T = t.messages;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const messages = useMemo(
    () => (thread ? Object.values(thread.byId).sort(compareMessages) : []),
    [thread]
  );

  // Keep position when older messages are prepended; otherwise stick to bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prepend.current) {
      el.scrollTop = prepend.current.top + (el.scrollHeight - prepend.current.height);
      prepend.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId]);

  // Auto-grow the composer up to ~6 lines.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [draft]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <EmptyState
          icon="ChatBubbleLeftRightIcon"
          title={T.selectTitle}
          description={T.selectBody}
          action={{ label: T.newConversation, onClick: onNewChat }}
        />
      </div>
    );
  }

  const name = conversation ? patientName(conversation.patient) : T.loading;
  const tooLong = draft.trim().length > MAX_MESSAGE_LENGTH;
  const canSend = draft.trim().length > 0 && !tooLong;

  const submit = () => {
    if (!canSend) return;
    stickToBottom.current = true;
    onSend(conversationId, draft);
    setDraft('');
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 80 && thread?.hasMore && !thread.loadingOlder) {
      prepend.current = { height: el.scrollHeight, top: el.scrollTop };
      onLoadOlder(conversationId);
    }
  };

  const authorLabel = (m: ChatMessage) => {
    if (m.senderRole === 'user') return null;
    if (m.senderId && m.senderId === myId) return myName ? T.youNamed(myName) : T.you;
    if (m.senderId && names[m.senderId]) return names[m.senderId];
    return T.researchTeam;
  };

  return (
    <>
      {/* Header */}
      <div className="h-16 shrink-0 px-5 flex items-center gap-3 border-b border-border bg-card">
        <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[12px] font-700">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-600 text-foreground truncate">{name}</p>
          {conversation?.patient.username && (
            <p className="text-[11px] font-mono text-muted-foreground truncate">@{conversation.patient.username}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-warning'}`} />
          {connected ? T.live : T.reconnecting}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto scrollbar-thin bg-background px-5 py-4">
        {thread?.loadingOlder && (
          <div className="flex justify-center py-2">
            <Icon name="ArrowPathIcon" size={16} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        )}
        {thread && !thread.hasMore && thread.loaded && messages.length > 0 && (
          <p className="text-center text-[11px] text-muted-foreground py-2">{T.startOfConversation}</p>
        )}

        {!thread || thread.loading ? (
          <div className="h-full flex items-center justify-center">
            <Icon name="ArrowPathIcon" size={20} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : thread.error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <p className="text-[13px] text-danger text-center max-w-sm">{thread.error}</p>
            <button onClick={() => onReload(conversationId)} className="text-[13px] font-600 text-primary hover:underline">
              {T.tryAgain}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground text-center">
            {T.emptyThread(name)}
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const mine = m.senderRole === 'team';
              const sameAuthorAsPrev =
                !!prev && !newDay && prev.senderRole === m.senderRole && prev.senderId === m.senderId &&
                Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
              const label = authorLabel(m);
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] font-600 text-muted-foreground">{formatDayLabel(m.createdAt)}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${sameAuthorAsPrev ? '' : 'pt-2'}`}>
                    <div className={`max-w-[70%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {!sameAuthorAsPrev && (
                        <span className="text-[11px] text-muted-foreground mb-1 px-1">
                          {mine ? label : name} · {formatMessageTime(m.createdAt)}
                        </span>
                      )}
                      <div
                        className={`px-3.5 py-2 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
                          mine
                            ? `bg-primary text-primary-foreground rounded-br-md ${m.state !== 'sent' ? 'opacity-70' : ''}`
                            : 'bg-card text-foreground border border-border rounded-bl-md'
                        }`}
                        title={new Date(m.createdAt).toLocaleString(locale)}
                      >
                        {m.content}
                      </div>
                      {m.state === 'pending' && (
                        <span className="text-[10.5px] text-muted-foreground mt-1 px-1">{T.sending}</span>
                      )}
                      {m.state === 'failed' && (
                        <span className="text-[11px] text-danger mt-1 px-1 flex items-center gap-1.5">
                          <Icon name="ExclamationCircleIcon" size={13} variant="outline" />
                          {failReasons[m.id] ?? T.notSent}
                          <button onClick={() => onRetry(m)} className="font-600 underline">
                            {T.retry}
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={T.placeholder(name)}
            className="flex-1 resize-none px-3.5 py-2.5 border border-border rounded-xl text-[13.5px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={submit}
            disabled={!canSend}
            className="h-[42px] px-4 bg-primary text-primary-foreground rounded-xl text-[13px] font-600 hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
            title={T.sendHint}
          >
            <Icon name="PaperAirplaneIcon" size={15} variant="solid" />
            {T.send}
          </button>
        </div>
        <div className="flex justify-between mt-1.5 px-1 text-[11px] text-muted-foreground">
          <span>{T.keys}</span>
          {draft.length > MAX_MESSAGE_LENGTH - 400 && (
            <span className={tooLong ? 'text-danger font-600' : ''}>
              {draft.trim().length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
