'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { inboxUnreadCount } from '@/lib/inbox';
import { useAuth } from '@/contexts/AuthContext';
import { staffText } from '@/lib/i18n/staff';

interface InboxValue {
  /** Unread broadcasts: what the inbox icon and the sidebar badge show. */
  unread: number;
  /** Increments whenever a broadcast arrives; the inbox page refetches on it. */
  version: number;
  refresh: () => Promise<void>;
}

const InboxContext = createContext<InboxValue>({ unread: 0, version: 0, refresh: async () => {} });

export const useInbox = () => useContext(InboxContext);

/**
 * Keeps the staff member's unread broadcast count live and shows a toast when a
 * broadcast arrives. One Realtime channel on new broadcasts: Realtime only delivers
 * the ones addressed to this person (RLS on public.broadcasts).
 */
export function InboxProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, isStaff } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUnread(await inboxUnreadCount(supabase));
    } catch {
      /* keep the last known count (e.g. before the migration is applied) */
    }
  }, [supabase]);

  useEffect(() => {
    if (!user || !isStaff) {
      setUnread(0);
      return;
    }
    void refresh();

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 250);
    };

    const channel = supabase
      .channel(`staff-inbox:${user.id}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcasts' },
        (payload) => {
          setVersion((v) => v + 1);
          scheduleRefresh();
          if (payload.eventType === 'INSERT' && !pathRef.current.startsWith('/inbox')) {
            const t = staffText().inbox.toast;
            toast(t.title, { action: { label: t.view, onClick: () => router.push('/inbox') } });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') scheduleRefresh();
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setVersion((v) => v + 1);
        scheduleRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, user, isStaff, refresh, router]);

  return <InboxContext.Provider value={{ unread, version, refresh }}>{children}</InboxContext.Provider>;
}
