'use client';

import React, { useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { initials } from '@/contexts/AuthContext';
import { patientName, type ConversationSummary } from '@/lib/chat';
import { formatListTime } from './format';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  myId: string | null;
  connected: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onNewChat: () => void;
}

type Filter = 'all' | 'awaiting';

export default function ConversationList({
  conversations,
  activeId,
  loading,
  error,
  myId,
  connected,
  onSelect,
  onRetry,
  onNewChat,
}: Props) {
  const T = useStaffT().t.messages;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const awaitingCount = useMemo(
    () => conversations.filter((c) => c.lastMessage?.senderRole === 'user').length,
    [conversations]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'awaiting' && c.lastMessage?.senderRole !== 'user') return false;
      if (!q) return true;
      return (
        c.patient.fullName.toLowerCase().includes(q) ||
        c.patient.username.toLowerCase().includes(q)
      );
    });
  }, [conversations, query, filter]);

  return (
    <aside className="w-[320px] xl:w-[360px] shrink-0 flex flex-col bg-card">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-700 text-foreground">{T.title}</h1>
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground/40'}`}
              title={connected ? T.liveOn : T.connecting}
            />
          </div>
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 transition-opacity"
            title={T.newHint}
          >
            <Icon name="PencilSquareIcon" size={14} variant="outline" />
            {T.new}
          </button>
        </div>

        <div className="relative">
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            variant="outline"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={T.searchPatients}
            className="w-full pl-8 pr-3 py-2 bg-muted rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
          {(
            [
              ['all', T.all],
              ['awaiting', T.needsReply(awaitingCount)],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 py-1.5 rounded-md text-[12px] font-600 transition-colors ${
                filter === key ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && conversations.length === 0 ? (
          <div className="p-3 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={`sk-${i}`} className="flex gap-3 p-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error && conversations.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[13px] text-danger mb-3">{error}</p>
            <button onClick={onRetry} className="text-[13px] font-600 text-primary hover:underline">
              {T.tryAgain}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-muted-foreground">
            {conversations.length === 0 ? (
              <>
                <p className="mb-3">{T.noConversations}</p>
                <button onClick={onNewChat} className="font-600 text-primary hover:underline">
                  {T.startOne}
                </button>
              </>
            ) : filter === 'awaiting' && !query ? (
              T.allCaughtUp
            ) : (
              T.noMatch
            )}
          </div>
        ) : (
          <ul className="py-1">
            {visible.map((c) => {
              const name = patientName(c.patient);
              const last = c.lastMessage;
              const awaiting = last?.senderRole === 'user';
              const prefix = !last ? '' : last.senderRole === 'user' ? '' : last.senderId === myId ? T.youPrefix : T.teamPrefix;
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                      isActive ? 'bg-primary/10' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[13px] font-700">
                        {initials(name)}
                      </div>
                      {awaiting && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-[13.5px] truncate ${awaiting ? 'font-700 text-foreground' : 'font-600 text-foreground'}`}>
                          {name}
                        </p>
                        <span className={`text-[11px] shrink-0 ${awaiting ? 'text-primary font-600' : 'text-muted-foreground'}`}>
                          {formatListTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <p className={`text-[12.5px] truncate mt-0.5 ${awaiting ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {!last ? (
                          <span className="italic">{T.noMessagesYet}</span>
                        ) : last.deletedAt ? (
                          <span className="italic">{prefix + (last.deletedByRole === 'team' && last.senderRole === 'user' ? T.removedByTeam : T.deleted)}</span>
                        ) : (
                          prefix + last.content
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
