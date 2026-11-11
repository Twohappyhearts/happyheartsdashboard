'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getAlertCounts, type AlertCounts } from '@/lib/alerts';
import { useAuth } from '@/contexts/AuthContext';
import { staffText } from '@/lib/i18n/staff';

interface OpenAlertsValue {
  counts: AlertCounts | null;
  /** NEW + ACK: what the bell and the sidebar badge show. */
  openCount: number;
  /** Increments on every alert change seen over Realtime; pages can refetch on it. */
  version: number;
  refresh: () => Promise<void>;
}

const OpenAlertsContext = createContext<OpenAlertsValue>({
  counts: null,
  openCount: 0,
  version: 0,
  refresh: async () => {},
});

export const useOpenAlerts = () => useContext(OpenAlertsContext);

/**
 * Keeps the open-alert count live for staff, app-wide (one Realtime channel),
 * and shows a toast when a participant sends a new assistance request.
 */
export function OpenAlertsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user, isStaff } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCounts(await getAlertCounts(supabase));
    } catch {
      /* keep the last known counts */
    }
  }, [supabase]);

  useEffect(() => {
    if (!user || !isStaff) {
      setCounts(null);
      return;
    }
    void refresh();

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 250);
    };

    const channel = supabase
      .channel(`staff-alerts:${user.id}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assistance_requests' }, (payload) => {
        setVersion((v) => v + 1);
        scheduleRefresh();
        if (payload.eventType === 'INSERT') {
          const msg = String((payload.new as Record<string, unknown>)?.message ?? '');
          const t = staffText().alertToast;
          toast(t.title, {
            description: msg.slice(0, 140),
            action: { label: t.view, onClick: () => router.push('/alerts') },
          });
        }
      })
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

  const value: OpenAlertsValue = {
    counts,
    openCount: counts ? counts.new + counts.ack : 0,
    version,
    refresh,
  };
  return <OpenAlertsContext.Provider value={value}>{children}</OpenAlertsContext.Provider>;
}
