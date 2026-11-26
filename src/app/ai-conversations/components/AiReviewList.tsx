'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import Select from '@/components/ui/Select';
import { reviewUserName, type ReviewConversation, type ReviewRole } from '@/lib/ai-review';
import { formatListTime } from '@/app/messages/components/format';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  conversations: ReviewConversation[];
  activeId: string | null;
  query: string;
  onQuery: (query: string) => void;
  role: ReviewRole | null;
  onRole: (role: ReviewRole | null) => void;
  searching: boolean;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
}

export default function AiReviewList({
  conversations,
  activeId,
  query,
  onQuery,
  role,
  onRole,
  searching,
  loading,
  error,
  hasMore,
  loadingMore,
  onSelect,
  onRetry,
  onLoadMore,
}: Props) {
  const { t } = useStaffT();
  const T = t.aiReview;
  return (
    <aside className="w-[300px] xl:w-[340px] shrink-0 flex flex-col bg-card">
      <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
        <h1 className="text-[17px] font-700 text-foreground">{T.title}</h1>
        <div className="relative">
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            variant="outline"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={T.search}
            className="w-full pl-8 pr-3 py-2 bg-muted rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select
          value={role ?? ''}
          onValueChange={(v) => onRole((v || null) as ReviewRole | null)}
          aria-label={t.users.roleFilters.all}
          options={[
            { value: '', label: t.users.roleFilters.all },
            { value: 'patient', label: t.users.roleFilters.patient },
            { value: 'staff', label: t.users.roleFilters.staff },
            { value: 'admin', label: t.users.roleFilters.admin },
          ]}
          className="w-full"
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex justify-center py-10">
            <Icon name="ArrowPathIcon" size={18} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[12.5px] text-danger mb-2">{error}</p>
            <button onClick={onRetry} className="text-[12.5px] font-600 text-primary hover:underline">
              {T.tryAgain}
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
            {searching ? T.noMatches : T.noConversations}
          </p>
        ) : (
          <>
            <ul className="py-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 border-l-2 transition-colors ${
                      c.id === activeId ? 'bg-primary/5 border-primary' : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon name="UserIcon" size={15} variant="outline" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-600 text-foreground truncate">{c.title?.trim() || T.untitled}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{reviewUserName(c.user, T.unknownUser)}</span>
                        {c.user.role && c.user.role !== 'patient' && (
                          <span className="shrink-0 px-1.5 py-px rounded bg-muted text-[10.5px] font-600 text-secondary-foreground">
                            {t.users.roleNames[c.user.role]}
                          </span>
                        )}
                        <span className="ml-auto shrink-0">{formatListTime(c.activityAt)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="px-4 pb-4 pt-1">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2 border border-border rounded-lg text-[12.5px] font-600 text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {loadingMore ? T.loadingMore : T.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
