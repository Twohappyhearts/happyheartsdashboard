'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import Icon from '@/components/ui/AppIcon';
import { AgentChatError, loadAnswerRatings, type AgentAuth, type AnswerRating } from '@/lib/agent-chat';
import { openAgentDocument, postToApp, requestFreshToken } from '@/lib/agent-bridge';
import { isEmergencySituation } from '@/lib/agent-fixed-replies';
import { languageNameIn } from '@/lib/i18n/patient';
import { usePatientText } from '@/lib/i18n/patient-context';
import type { Language } from '@/lib/languages';
import { messageText, pendingApproval, useAgentChat } from '@/lib/use-agent-chat';
import AiMessageParts from '@/app/ai-chat/components/AiMessageParts';
import AnswerRatingBar from './AnswerRatingBar';

const MAX_LENGTH = 4000;

interface Props {
  conversationId: string | null;
  title: string;
  initialMessages: UIMessage[];
  /** Bearer token from the app; undefined = the dashboard session cookie (staff preview). */
  auth?: AgentAuth;
  /** Language messages to the care team are written in (Settings). */
  careTeamLanguage: Language;
  onShowList: () => void;
  onNew: () => void;
  onConversationCreated: (id: string) => void;
  onTitle: (conversationId: string, title: string) => void;
  onTurnFinished: () => void;
  /** A message was refused with 403: the notice may have to be accepted again. */
  onForbidden?: () => void;
  /** Report the current messages (so the parent can cache them). */
  onMessagesChange?: (conversationId: string, messages: UIMessage[]) => void;
}

/** A call button for 911 / 988 (the app hands tel: links to the phone). */
function CallLink({ number, label, primary }: { number: string; label: string; primary: boolean }) {
  return (
    <a
      href={`tel:${number}`}
      className={`inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-[15px] font-700 ${
        primary ? 'bg-danger text-white' : 'border-2 border-danger text-danger bg-card'
      }`}
    >
      <Icon name="PhoneIcon" size={17} variant="solid" className="shrink-0" />
      {label}
    </a>
  );
}

export default function MobileChatThread({
  conversationId,
  title,
  initialMessages,
  auth,
  careTeamLanguage,
  onShowList,
  onNew,
  onConversationCreated,
  onTitle,
  onTurnFinished,
  onForbidden,
  onMessagesChange,
}: Props) {
  const { t, lang } = usePatientText();
  const { messages, sendMessage, status, stop, error, clearError, answerApproval, busy } = useAgentChat({
    conversationId,
    initialMessages,
    auth,
    onConversationCreated,
    onTitle,
    onTurnFinished,
    onUnauthorized: requestFreshToken,
    onForbidden,
    throttleMs: 60,
  });

  // Cache the latest messages once nothing is streaming (cheap: a Map write).
  useEffect(() => {
    if (conversationId && !busy) onMessagesChange?.(conversationId, messages);
  }, [conversationId, messages, busy, onMessagesChange]);

  // Trial ratings of this conversation's answers (test branch only; a rating made just now wins
  // over the loaded list). Shown in the app only, not in the staff preview.
  const [ratings, setRatings] = useState<Record<string, AnswerRating>>({});
  useEffect(() => {
    if (!conversationId || !auth) return;
    let cancelled = false;
    loadAnswerRatings(conversationId, auth)
      .then((list) => {
        if (!cancelled) setRatings((now) => ({ ...Object.fromEntries(list.map((r) => [r.messageId, r])), ...now }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId, auth]);

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
    const trimmed = text.trim();
    if (!trimmed || busy || trimmed.length > MAX_LENGTH) return;
    stickToBottom.current = true;
    clearError();
    void sendMessage({ text: trimmed });
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
  const pendingInput = (pending?.input as { message?: string; situation?: unknown } | undefined) ?? {};
  const pendingDraft = pendingInput.message ?? '';
  // After a 911 / 988 reply the sheet does not open by itself: it would cover the reply. The
  // patient opens it with "Also notify my care team" under the answer.
  const emergency = isEmergencySituation(pendingInput.situation);
  const crisis = emergency && pendingInput.situation !== 'urgent';
  // The patient can edit the AI's draft before sending; reset when a new request comes in.
  const [sheetText, setSheetText] = useState('');
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (pendingId && pendingId !== sheetFor) {
    setSheetFor(pendingId);
    setSheetText(pendingDraft);
  }
  const sheetOpen = !!pending && pending.state === 'approval-requested' && (!emergency || openedFor === pendingId);

  const cancelSheet = () => {
    if (!pending || pending.state !== 'approval-requested') return;
    // An emergency offer the patient opened stays available under the answer.
    if (emergency) setOpenedFor(null);
    else answer(pending.approval.id, false);
  };

  const last = messages[messages.length - 1];
  const waitingForFirstToken = status === 'submitted' && last?.role === 'user';
  const errorText = error ? (error instanceof AgentChatError && error.status === 401 ? t.signInAgain : t.chatError) : null;

  return (
    <>
      {/* Header */}
      <div className="h-12 shrink-0 px-2 flex items-center gap-1 border-b border-border bg-card">
        <button onClick={onShowList} className="p-2 rounded-lg active:bg-muted" aria-label={t.yourConversations}>
          <Icon name="Bars3Icon" size={20} variant="outline" />
        </button>
        <p className="flex-1 min-w-0 text-[15px] font-600 truncate">{title}</p>
        <button onClick={onNew} disabled={busy} className="p-2 rounded-lg active:bg-muted disabled:opacity-40" aria-label={t.newConversation}>
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
            <p className="text-[16px] font-600">{t.emptyTitle}</p>
            <p className="text-[13px] text-muted-foreground mt-1 mb-5">{t.emptySubtitle}</p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {t.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-4 py-2.5 rounded-xl border border-border bg-card text-[14px] text-start active:bg-muted"
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
                  <div
                    dir="auto"
                    className="max-w-[82%] px-3.5 py-2.5 rounded-2xl rounded-ee-md bg-primary text-primary-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words"
                  >
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
                      audience="patient"
                      streaming={busy && i === messages.length - 1}
                      canRespond={!busy && i === messages.length - 1}
                      inlineApproval={false}
                      onApproval={answer}
                      onOpenCareteam={setOpenedFor}
                      onOpenDocument={(id) => openAgentDocument(id, auth)}
                    />
                    {auth && !(busy && i === messages.length - 1) && !(pending && i === messages.length - 1) && (
                      <AnswerRatingBar
                        messageId={m.id}
                        rating={ratings[m.id] ?? null}
                        auth={auth}
                        onSaved={(r) => setRatings((now) => ({ ...now, [r.messageId]: r }))}
                      />
                    )}
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
                {t.thinking}
              </div>
            )}
            {errorText && (
              <p className="text-[13px] text-danger flex items-center gap-1.5">
                <Icon name="ExclamationCircleIcon" size={15} variant="outline" className="shrink-0" />
                {errorText}
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
            dir="auto"
            maxLength={MAX_LENGTH}
            placeholder={t.placeholder}
            // 16px: iOS does not zoom into inputs at this size.
            className="flex-1 resize-none px-3.5 py-2.5 rounded-2xl border border-border bg-background text-[16px] leading-snug placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {busy ? (
            <button
              onClick={() => void stop()}
              className="w-11 h-11 rounded-full border border-border flex items-center justify-center active:bg-muted"
              aria-label={t.stop}
            >
              <Icon name="StopIcon" size={18} variant="solid" />
            </button>
          ) : (
            <button
              onClick={() => send(draft)}
              disabled={!draft.trim()}
              className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
              aria-label={t.send}
            >
              <Icon name="PaperAirplaneIcon" size={18} variant="solid" className="rtl:-scale-x-100" />
            </button>
          )}
        </div>
      </div>

      {/* Care-team confirmation: the agent proposed a message; nothing is sent until the patient presses Send. */}
      {sheetOpen && pending && pending.state === 'approval-requested' && (
        <div className="fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/30" onClick={emergency ? cancelSheet : undefined} />
          <div className="relative w-full max-h-[calc(100dvh-1rem)] overflow-y-auto bg-card rounded-t-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-modal">
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
            {emergency && (
              <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-3.5 py-3">
                <p className="flex items-start gap-2 text-[15px] font-700 leading-snug text-danger">
                  <Icon name="ExclamationTriangleIcon" size={20} variant="solid" className="shrink-0 mt-0.5" />
                  <span>{t.emergencyBanner}</span>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <CallLink number="911" label={t.call('911')} primary />
                  {crisis && <CallLink number="988" label={t.call('988')} primary={false} />}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon name="BellAlertIcon" size={20} variant="outline" />
              </div>
              <div>
                <p className="text-[16px] font-700">{t.sheetTitle}</p>
                <p className="text-[12.5px] text-muted-foreground">{t.sheetSubtitle}</p>
              </div>
            </div>
            <label className="block text-[12.5px] font-600 text-secondary-foreground mb-1.5" htmlFor="careteam-message">
              {t.sheetLabel}
            </label>
            <textarea
              id="careteam-message"
              value={sheetText}
              onChange={(e) => setSheetText(e.target.value)}
              maxLength={1000}
              rows={4}
              dir="auto"
              // 16px: iOS does not zoom into inputs at this size.
              className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[16px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-between gap-3 text-[12.5px] text-muted-foreground mt-1 mb-4">
              <span>
                {t.sentInLanguage(languageNameIn(lang, careTeamLanguage))}
                {!emergency && ` ${t.sheetEmergencyLine}`}
              </span>
              {sheetText.length > 800 && <span className="shrink-0 tabular-nums">{sheetText.length}/1000</span>}
            </div>
            <div className="flex gap-3">
              <button onClick={cancelSheet} className="flex-1 h-12 rounded-xl border border-border text-[15px] font-600 active:bg-muted">
                {t.cancel}
              </button>
              <button
                onClick={() => {
                  setOpenedFor(null);
                  answer(pending.approval.id, true, sheetText);
                }}
                disabled={!sheetText.trim()}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground text-[15px] font-600 active:opacity-90 disabled:opacity-40"
              >
                {t.send}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
