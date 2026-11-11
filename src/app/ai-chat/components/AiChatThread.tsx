'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { splitDisclaimer, TERMS_URL } from '@/lib/agent-fixed-replies';
import { messageText as textOf, useAgentChat } from '@/lib/use-agent-chat';
import Icon from '@/components/ui/AppIcon';
import EmptyState from '@/components/ui/EmptyState';
import AiMessageParts from './AiMessageParts';

const MAX_LENGTH = 4000;

/** The research team's disclaimer, word for word, with "Terms of Use" linking to the current Terms. */
const [DISCLAIMER_BEFORE, DISCLAIMER_LINK, DISCLAIMER_AFTER] = splitDisclaimer();

interface Props {
  conversationId: string | null;
  title: string;
  initialMessages: UIMessage[];
  /** Called once the server created the conversation for a new chat. */
  onConversationCreated: (id: string) => void;
  /** Called after every assistant turn (to refresh the list). */
  onTurnFinished: () => void;
  /** The server sends the generated title of a new conversation at the end of its first reply. */
  onTitle: (conversationId: string, title: string) => void;
}

export default function AiChatThread({ conversationId, title, initialMessages, onConversationCreated, onTurnFinished, onTitle }: Props) {
  const { messages, sendMessage, status, stop, error, clearError, answerApproval, busy } = useAgentChat({
    conversationId,
    initialMessages,
    onConversationCreated,
    onTurnFinished,
    onTitle,
  });

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [draft]);

  const tooLong = draft.trim().length > MAX_LENGTH;
  const canSend = draft.trim().length > 0 && !tooLong && !busy;

  const submit = () => {
    if (!canSend) return;
    stickToBottom.current = true;
    clearError();
    void sendMessage({ text: draft.trim() });
    setDraft('');
  };

  const last = messages[messages.length - 1];
  const waitingForFirstToken = status === 'submitted' && last?.role === 'user';

  return (
    <>
      {/* Header */}
      <div className="h-16 shrink-0 px-5 flex items-center gap-3 border-b border-border bg-card">
        <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground">
          <Icon name="SparklesIcon" size={17} variant="solid" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-600 text-foreground truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">Answers from the knowledge base and web search</p>
        </div>
        <span
          className="ml-auto text-[11px] font-600 px-2 py-1 rounded-md bg-warning/10 text-warning shrink-0"
          title="You are signed in as staff. Care-team messages ask for approval as they do for patients, but no real alert is created."
        >
          Staff preview
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto scrollbar-thin bg-background px-5 py-4"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon="SparklesIcon"
              title="Ask the assistant"
              description="Ask what a patient might ask — e.g. about diet, medication questions, or contacting the care team."
            />
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[75%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                    {textOf(m)}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="SparklesIcon" size={14} variant="outline" />
                  </div>
                  <div className="min-w-0 flex-1 max-w-[85%]">
                    <AiMessageParts
                      message={m}
                      streaming={busy && i === messages.length - 1}
                      canRespond={!busy && i === messages.length - 1}
                      onApproval={(id, approved, editedMessage) => {
                        stickToBottom.current = true;
                        clearError();
                        void answerApproval(id, approved, editedMessage);
                      }}
                    />
                  </div>
                </div>
              ),
            )}
            {waitingForFirstToken && (
              <div className="flex gap-2.5 items-center text-[12px] text-muted-foreground">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name="SparklesIcon" size={14} variant="outline" />
                </div>
                <Icon name="ArrowPathIcon" size={13} variant="outline" className="animate-spin" />
                Thinking…
              </div>
            )}
            {error && (
              <p className="text-[12.5px] text-danger flex items-center gap-1.5">
                <Icon name="ExclamationCircleIcon" size={14} variant="outline" />
                {error.message || 'Something went wrong. Please try again.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
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
            autoFocus
            placeholder="Ask the assistant"
            className="flex-1 resize-none px-3.5 py-2.5 border border-border rounded-xl text-[13.5px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {busy ? (
            <button
              onClick={() => void stop()}
              className="h-[42px] px-4 border border-border text-foreground rounded-xl text-[13px] font-600 hover:bg-muted flex items-center gap-1.5"
              title="Stop showing the reply"
            >
              <Icon name="StopIcon" size={15} variant="solid" />
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              className="h-[42px] px-4 bg-primary text-primary-foreground rounded-xl text-[13px] font-600 hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
              title="Send (Enter)"
            >
              <Icon name="PaperAirplaneIcon" size={15} variant="solid" />
              Send
            </button>
          )}
        </div>
        <div className="flex justify-between mt-1.5 px-1 text-[11px] text-muted-foreground max-w-3xl mx-auto">
          <span>Enter to send · Shift+Enter for a new line</span>
          {draft.length > MAX_LENGTH - 400 && (
            <span className={tooLong ? 'text-danger font-600' : ''}>
              {draft.trim().length}/{MAX_LENGTH}
            </span>
          )}
        </div>
        <p className="mt-1 px-1 text-[11px] leading-snug text-muted-foreground max-w-3xl mx-auto">
          {DISCLAIMER_BEFORE}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
            {DISCLAIMER_LINK}
          </a>
          {DISCLAIMER_AFTER}
        </p>
      </div>
    </>
  );
}
