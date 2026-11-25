'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import EmptyState from '@/components/ui/EmptyState';
import { createClient } from '@/lib/supabase/client';
import { useInbox } from '@/contexts/InboxContext';
import { INBOX_PAGE, listInbox, markInboxRead, type InboxItem } from '@/lib/inbox';
import { useStaffT } from '@/lib/i18n/staff/context';

function formatSent(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Broadcast messages sent to this staff member. Opening the page marks them as
 * read; the ones that were unread keep their highlight until the page is left.
 */
export default function InboxClient() {
  const supabase = useMemo(() => createClient(), []);
  const { version, refresh } = useInbox();
  const { t, locale } = useStaffT();
  const T = t.inbox;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Unread when they arrived on screen: keeps the highlight after they are marked read.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const rows = await listInbox(supabase);
      if (n !== seq.current) return;
      setItems(rows);
      setMore(rows.length === INBOX_PAGE);
      setFailed(false);
      const unread = rows.filter((r) => r.unread).map((r) => r.id);
      if (unread.length > 0) {
        setFresh((prev) => new Set([...prev, ...unread]));
        await markInboxRead(supabase, rows[0].createdAt);
        void refresh();
      }
    } catch {
      if (n === seq.current) setFailed(true);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [supabase, refresh]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await listInbox(supabase, last.createdAt);
      setItems((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      setMore(rows.length === INBOX_PAGE);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
        >
          <Icon name="ArrowPathIcon" size={14} variant="outline" className={loading ? 'animate-spin' : ''} />
          {T.refresh}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading && items.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13px] text-muted-foreground">{T.loading}</p>
        ) : failed && items.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13px] text-danger">{T.loadFailed}</p>
        ) : items.length === 0 ? (
          <EmptyState icon="InboxIcon" title={T.emptyTitle} description={T.emptyBody} />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((m) => {
              const isNew = fresh.has(m.id);
              return (
                <li key={m.id} className={`px-5 py-4 ${isNew ? 'bg-blue-50/60' : ''}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon name="MegaphoneIcon" size={14} variant="outline" />
                    </div>
                    <span className="text-[13px] font-600 text-foreground">
                      {m.senderName ? T.from(m.senderName) : T.fromTeam}
                    </span>
                    {isNew && (
                      <span className="bg-blue-500 text-white text-[10px] font-700 rounded-full px-1.5 py-0.5 leading-none">
                        {T.newBadge}
                      </span>
                    )}
                    <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">{formatSent(m.createdAt, locale)}</span>
                  </div>
                  <p className="pl-9 text-[13.5px] text-foreground whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                </li>
              );
            })}
          </ul>
        )}
        {more && (
          <div className="border-t border-border p-3 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loadingMore ? T.loading : T.loadMore}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
