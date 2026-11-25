'use client';

import React, { useEffect, useMemo } from 'react';
import type { UIMessage } from 'ai';
import Icon from '@/components/ui/AppIcon';
import { openAgentDocument, type AgentHistoryMessage } from '@/lib/agent-chat';
import type { ReviewRating, ReviewThread } from '@/lib/ai-review';
import { dayKey, formatDayLabel, formatMessageTime } from '@/app/messages/components/format';
import { useStaffT } from '@/lib/i18n/staff/context';
import AiMessageParts from '@/app/ai-chat/components/AiMessageParts';

type ReviewText = ReturnType<typeof useStaffT>['t']['aiReview'];

const textOf = (m: UIMessage) =>
  m.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();

/** "‹ 2/3 ›" under a patient message with several versions. */
function VersionSwitcher({
  message,
  disabled,
  T,
  onSwitch,
}: {
  message: AgentHistoryMessage;
  disabled: boolean;
  T: ReviewText;
  onSwitch: (messageId: string) => void;
}) {
  const versions = message.siblingIds ?? [message.id];
  const at = versions.indexOf(message.id);
  if (versions.length < 2 || at < 0) return null;
  return (
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
  );
}

function RatingChips({ rating, T }: { rating: ReviewRating | undefined; T: ReviewText }) {
  if (!rating) return null;
  const safety =
    rating.safety === 3
      ? { label: T.safe, cls: 'bg-success/10 text-success' }
      : rating.safety === 2
        ? { label: T.concern, cls: 'bg-warning/10 text-warning' }
        : rating.safety === 1
          ? { label: T.unsafe, cls: 'bg-danger/10 text-danger' }
          : null;
  return (
    <>
      {rating.usability != null && (
        <span className="px-1.5 py-0.5 rounded-md bg-muted text-foreground font-500">
          {T.usability} {rating.usability}/5
        </span>
      )}
      {safety && (
        <span className={`px-1.5 py-0.5 rounded-md font-500 ${safety.cls}`}>
          {T.safety} · {safety.label}
        </span>
      )}
    </>
  );
}

interface Props {
  thread: ReviewThread;
  title: string;
  ownerLine: string;
  switching: boolean;
  /** A message to bring into view and mark (from a link to one answer). */
  focusId?: string | null;
  onSwitch: (messageId: string) => void;
}

export default function AiReviewThread({ thread, title, ownerLine, switching, focusId, onSwitch }: Props) {
  const T = useStaffT().t.aiReview;
  const ratings = useMemo(() => new Map(thread.ratings.map((r) => [r.messageId, r])), [thread.ratings]);
  const messages = thread.messages;

  useEffect(() => {
    if (focusId) document.getElementById(`review-msg-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId]);

  return (
    <>
      <div className="h-16 shrink-0 px-5 flex items-center gap-3 border-b border-border bg-card">
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon name="UserIcon" size={17} variant="outline" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-600 text-foreground truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{ownerLine}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-background px-5 py-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((m, i) => {
            const showDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
            const day = showDay ? (
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-600 text-muted-foreground">{formatDayLabel(m.createdAt)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            ) : null;

            if (m.role === 'user') {
              return (
                <React.Fragment key={m.id}>
                  {day}
                  <div className="flex flex-col items-end">
                    <div className="max-w-[75%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                      {textOf(m)}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground min-h-[24px]">
                      <VersionSwitcher message={m} disabled={switching} T={T} onSwitch={onSwitch} />
                      <span className="ml-1">{formatMessageTime(m.createdAt)}</span>
                    </div>
                  </div>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={m.id}>
                {day}
                <div
                  id={`review-msg-${m.id}`}
                  className={`flex gap-2.5 ${m.id === focusId ? 'rounded-xl ring-2 ring-primary/40 ring-offset-4 ring-offset-background' : ''}`}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="SparklesIcon" size={14} variant="outline" />
                  </div>
                  <div className="min-w-0 flex-1 max-w-[85%]">
                    <AiMessageParts
                      message={m}
                      streaming={false}
                      onOpenDocument={(id) => openAgentDocument(id)}
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <span>{formatMessageTime(m.createdAt)}</span>
                      <RatingChips rating={ratings.get(m.id)} T={T} />
                    </div>
                    {ratings.get(m.id)?.comment && (
                      <p className="mt-1.5 text-[12.5px] text-foreground bg-muted/60 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                        “{ratings.get(m.id)!.comment}”
                      </p>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
