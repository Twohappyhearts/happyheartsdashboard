'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import Icon from '@/components/ui/AppIcon';
import { bearerAuth, postToApp, requestFreshToken } from '@/lib/agent-bridge';
import { messageText, pendingApproval, useAgentChat } from '@/lib/use-agent-chat';
import AiMessageParts from '@/app/ai-chat/components/AiMessageParts';

const MAX_LENGTH = 4000;

const SUGGESTIONS = ['What should I eat after my procedure?', 'I feel a bit dizzy today', 'Can you contact my care team?'];

interface Props {
  conversationId: string | null;
  title: string;
  initialMessages: UIMessage[];
  onShowList: () => void;
  onNew: () => void;
  onConversationCreated: (id: string) => void;
  onTitle: (conversationId: string, title: string) => void;
  onTurnFinished: () => void;
  /** Report the current messages (so the parent can cache them). */
  onMessagesChange?: (conversationId: string, messages: UIMessage[]) => void;
}

export default function MobileChatThread({
  conversationId,
  title,
  initialMessages,
  onShowList,
  onNew,
  onConversationCreated,
  onTitle,
  onTurnFinished,
  onMessagesChange,
}: Props) {
  const { messages, sendMessage, status, stop, error, clearError, answerApproval, busy } = useAgentChat({
    conversationId,
    initialMessages,
    auth: bearerAuth,
    onConversationCreated,
    onTitle,
    onTurnFinished,
    onUnauthorized: requestFreshToken,
    throttleMs: 60,
  });

  // Cache the latest messages once nothing is streaming (cheap: a Map write).
  useEffect(() => {
    if (conversationId && !busy) onMessagesChange?.(conversationId, messages);
  }, [conversationId, messages, busy, onMessagesChange]);

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
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [draft]);

  // Tell the app when a care-team request was really sent (it shows its own confirmation).
  const reported = useRef(new Set<string>());
  const known = useRef<Set<string> | null>(null);
  if (known.current === null) {
    // Requests already in the history are not new.
    known.current = new Set(
      initialMessages.flatMap((m) => m.parts.flatMap((p) => (isToolUIPart(p) && p.state === 'output-available' ? [p.toolCallId] : []))),
    );
  }
  useEffect(() => {
    for (const m of messages) {
      for (const p of m.parts) {
        if (!isToolUIPart(p) || getToolName(p) !== 'notifyCareteam' || p.state !== 'output-available') continue;
        if (known.current!.has(p.toolCallId) || reported.current.has(p.toolCallId)) continue;
        reported.current.add(p.toolCallId);
        const out = p.output as { requestId?: string | null; preview?: boolean } | undefined;
        if (out && !out.preview) postToApp('assistance_sent', { requestId: out.requestId ?? null });
      }
    }
  }, [messages]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || t.length > MAX_LENGTH) return;
    stickToBottom.current = true;
    clearError();
    void sendMessage({ text: t });
    setDraft('');
    textareaRef.current?.blur();
  };

  const answer = (approvalId: string, approved: boolean, editedMessage?: string) => {
    stickToBottom.current = true;
    clearError();
    void answerApproval(approvalId, approved, editedMessage);
  };

  const pending = busy ? null : pendingApproval(messages);
  const pendingId = pending?.state === 'approval-requested' ? pending.approval.id : null;
  const pendingDraft = pending ? ((pending.input as { message?: string } | undefined)?.message ?? '') : '';
  // The patient can edit the AI's draft before sending; reset when a new request comes in.
  const [sheetText, setSheetText] = useState('');
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  if (pendingId && pendingId !== sheetFor) {
    setSheetFor(pendingId);
    setSheetText(pendingDraft);
  }
  const last = messages[messages.length - 1];
  const waitingForFirstToken = status === 'submitted' && last?.role === 'user';

  return (
    <>
      {/* Header */}
      <div className="h-12 shrink-0 px-2 flex items-center gap-1 border-b border-border bg-card">
        <button onClick={onShowList} className="p-2 rounded-lg active:bg-muted" aria-label="Your conversations">
          <Icon name="Bars3Icon" size={20} variant="outline" />
        </button>
        <p className="flex-1 min-w-0 text-[15px] font-600 truncate">{title}</p>
        <button onClick={onNew} disabled={busy} className="p-2 rounded-lg active:bg-muted disabled:opacity-40" aria-label="New conversation">
          <Icon name="PencilSquareIcon" size={20} variant="outline" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-full bg-[#EDE9FE] text-[#7C3AED] flex items-center justify-center mb-3">
              <Icon name="SparklesIcon" size={24} variant="outline" />
            </div>
            <p className="text-[16px] font-600">How can I help today?</p>
            <p className="text-[13px] text-muted-foreground mt-1 mb-5">Ask about your recovery, or tell me how you are feeling.</p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-4 py-2.5 rounded-xl border border-border bg-card text-[14px] text-left active:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                    {messageText(m)}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#EDE9FE] text-[#7C3AED] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="SparklesIcon" size={14} variant="outline" />
                  </div>
                  <div className="min-w-0 flex-1 text-[15px] [&_.prose]:text-[15px]">
                    <AiMessageParts
                      message={m}
                      streaming={busy && i === messages.length - 1}
                      canRespond={!busy && i === messages.length - 1}
                      inlineApproval={false}
                      onApproval={answer}
                    />
                  </div>
                </div>
              ),
            )}
            {waitingForFirstToken && (
              <div className="flex gap-2 items-center text-[13px] text-muted-foreground">
                <div className="w-7 h-7 rounded-full bg-[#EDE9FE] text-[#7C3AED] flex items-center justify-center shrink-0">
                  <Icon name="SparklesIcon" size={14} variant="outline" />
                </div>
                <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
                Thinking…
              </div>
            )}
            {error && (
              <p className="text-[13px] text-danger flex items-center gap-1.5">
                <Icon name="ExclamationCircleIcon" size={15} variant="outline" />
                {error.message || 'Something went wrong. Please try again.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-card px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder="Type a message"
            // 16px: iOS does not zoom into inputs at this size.
            className="flex-1 resize-none px-3.5 py-2.5 rounded-2xl border border-border bg-background text-[16px] leading-snug placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {busy ? (
            <button
              onClick={() => void stop()}
              className="w-11 h-11 rounded-full border border-border flex items-center justify-center active:bg-muted"
              aria-label="Stop"
            >
              <Icon name="StopIcon" size={18} variant="solid" />
            </button>
          ) : (
            <button
              onClick={() => send(draft)}
              disabled={!draft.trim()}
              className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
              aria-label="Send"
            >
              <Icon name="PaperAirplaneIcon" size={18} variant="solid" />
            </button>
          )}
        </div>
      </div>

      {/* Care-team confirmation: the agent proposed a message; nothing is sent until the patient presses Send. */}
      {pending && pending.state === 'approval-requested' && (
        <div className="fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full bg-card rounded-t-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-modal">
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon name="BellAlertIcon" size={20} variant="outline" />
              </div>
              <div>
                <p className="text-[16px] font-700">Send this to your care team?</p>
                <p className="text-[12.5px] text-muted-foreground">A team member will see it and follow up with you.</p>
              </div>
            </div>
            <label className="block text-[12.5px] font-600 text-secondary-foreground mb-1.5" htmlFor="careteam-message">
              Your message (you can edit it)
            </label>
            <textarea
              id="careteam-message"
              value={sheetText}
              onChange={(e) => setSheetText(e.target.value)}
              maxLength={1000}
              rows={4}
              // 16px: iOS does not zoom into inputs at this size.
              className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[16px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-between text-[12px] text-muted-foreground mt-1 mb-4">
              <span>If this is an emergency, call 911 now.</span>
              {sheetText.length > 800 && <span>{sheetText.length}/1000</span>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => answer(pending.approval.id, false)}
                className="flex-1 h-12 rounded-xl border border-border text-[15px] font-600 active:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => answer(pending.approval.id, true, sheetText)}
                disabled={!sheetText.trim()}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-[15px] font-600 active:opacity-90 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
