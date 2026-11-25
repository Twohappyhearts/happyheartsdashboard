'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { toast } from 'sonner';
import { openAgentDocument, siblingIdsOf } from '@/lib/agent-chat';
import { messageText as textOf, useAgentChat } from '@/lib/use-agent-chat';
import Icon from '@/components/ui/AppIcon';
import EmptyState from '@/components/ui/EmptyState';
import AiMessageParts from './AiMessageParts';
import { useStaffT } from '@/lib/i18n/staff/context';

const MAX_LENGTH = 4000;
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StaffAiChatText = ReturnType<typeof useStaffT>['t']['aiChat'];

/**
 * The tester's message: edit it (a new version, on a new branch) and switch between its versions
 * ("‹ 2/3 ›"), as in Claude. Only messages the server has saved (server ids) can be edited.
 */
function UserMessage({
  message,
  disabled,
  T,
  onEdit,
  onSwitch,
}: {
  message: UIMessage;
  disabled: boolean;
  T: StaffAiChatText;
  onEdit: (text: string) => void;
  onSwitch: (messageId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const versions = siblingIdsOf(message);
  const at = versions.indexOf(message.id);
  const saved = SERVER_ID.test(message.id);

  if (editing) {
    const value = text.trim();
    const send = () => {
      if (!value || value.length > MAX_LENGTH) return;
      setEditing(false);
      onEdit(value);
    };
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[75%] space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
              if (e.key === 'Escape') setEditing(false);
            }}
            rows={Math.min(8, Math.max(2, text.split('\n').length))}
            autoFocus
            className="w-full resize-none px-3.5 py-2.5 border border-border rounded-xl text-[13.5px] text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="h-8 px-3 border border-border rounded-lg text-[12.5px] font-600 text-foreground hover:bg-muted"
            >
              {T.cancel}
            </button>
            <button
              onClick={send}
              disabled={!value || value.length > MAX_LENGTH || disabled}
              className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-[12.5px] font-600 hover:opacity-90 disabled:opacity-40"
            >
              {T.editSend}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[75%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
        {textOf(message)}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground min-h-[24px]">
        {versions.length > 1 && at >= 0 && (
          <>
            <button
              onClick={() => onSwitch(versions[at - 1])}
              disabled={disabled || at === 0}
              aria-label={T.previousVersion}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
            >
              <Icon name="ChevronLeftIcon" size={13} variant="outline" />
            </button>
            <span className="tabular-nums">
              {at + 1}/{versions.length}
            </span>
            <button
              onClick={() => onSwitch(versions[at + 1])}
              disabled={disabled || at === versions.length - 1}
              aria-label={T.nextVersion}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
            >
              <Icon name="ChevronRightIcon" size={13} variant="outline" />
            </button>
          </>
        )}
        {saved && (
          <button
            onClick={() => {
              setText(textOf(message));
              setEditing(true);
            }}
            disabled={disabled}
            title={T.edit}
            aria-label={T.edit}
            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 transition-opacity"
          >
            <Icon name="PencilSquareIcon" size={13} variant="outline" />
          </button>
        )}
      </div>
    </div>
  );
}

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
  const { messages, sendMessage, status, stop, error, clearError, busy, editMessage, switchVersion } = useAgentChat({
    conversationId,
    initialMessages,
    onConversationCreated,
    onTurnFinished,
    onTitle,
  });

  const T = useStaffT().t.aiChat;
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
          <p className="text-[11px] text-muted-foreground truncate">{T.sources}</p>
        </div>
        <span
          className="ml-auto text-[11px] font-600 px-2 py-1 rounded-md bg-warning/10 text-warning shrink-0"
          title={T.staffPreviewHint}
        >
          {T.staffPreview}
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
              title={T.emptyTitle}
              description={T.emptyBody}
            />
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <UserMessage
                  key={m.id}
                  message={m}
                  disabled={busy}
                  T={T}
                  onEdit={(text) => {
                    stickToBottom.current = true;
                    clearError();
                    editMessage(m.id, text);
                  }}
                  onSwitch={(id) => {
                    clearError();
                    switchVersion(id).catch(() => toast.error(T.versionFailed));
                  }}
                />
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="SparklesIcon" size={14} variant="outline" />
                  </div>
                  <div className="min-w-0 flex-1 max-w-[85%]">
                    <AiMessageParts
                      message={m}
                      streaming={busy && i === messages.length - 1}
                      onOpenDocument={(id) => openAgentDocument(id)}
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
                {T.thinking}
              </div>
            )}
            {error && (
              <p className="text-[12.5px] text-danger flex items-center gap-1.5">
                <Icon name="ExclamationCircleIcon" size={14} variant="outline" />
                {error.message || T.error}
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
            placeholder={T.placeholder}
            className="flex-1 resize-none px-3.5 py-2.5 border border-border rounded-xl text-[13.5px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {busy ? (
            <button
              onClick={() => void stop()}
              className="h-[42px] px-4 border border-border text-foreground rounded-xl text-[13px] font-600 hover:bg-muted flex items-center gap-1.5"
              title={T.stopHint}
            >
              <Icon name="StopIcon" size={15} variant="solid" />
              {T.stop}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              className="h-[42px] px-4 bg-primary text-primary-foreground rounded-xl text-[13px] font-600 hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
              title={T.sendHint}
            >
              <Icon name="PaperAirplaneIcon" size={15} variant="solid" />
              {T.send}
            </button>
          )}
        </div>
        <div className="flex justify-between mt-1.5 px-1 text-[11px] text-muted-foreground max-w-3xl mx-auto">
          <span>{T.keys}</span>
          {draft.length > MAX_LENGTH - 400 && (
            <span className={tooLong ? 'text-danger font-600' : ''}>
              {draft.trim().length}/{MAX_LENGTH}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
