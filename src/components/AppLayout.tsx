'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import ChangePasswordGate from '@/components/ChangePasswordGate';
import { useStaffT } from '@/lib/i18n/staff/context';

interface AppLayoutProps {
  children: React.ReactNode;
  /** Full-height content without page padding (used by Messages). */
  fullBleed?: boolean;
}

/**
 * Every page renders its own AppLayout, so the sidebar state would reset to "expanded" on
 * each navigation. It is kept here (for the open tab) and in localStorage (across reloads).
 */
const SIDEBAR_KEY = 'hh.sidebar.collapsed';
let sidebarCollapsed: boolean | null = null;

function readCollapsed(): boolean {
  if (sidebarCollapsed !== null) return sidebarCollapsed;
  if (typeof window === 'undefined') return false;
  try {
    sidebarCollapsed = window.localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    sidebarCollapsed = false;
  }
  return sidebarCollapsed;
}

export default function AppLayout({ children, fullBleed = false }: AppLayoutProps) {
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = (next: boolean) => {
    sidebarCollapsed = next;
    setCollapsedState(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
    } catch {
      // private mode: the choice still holds until the tab is reloaded
    }
  };
  const { user, isStaff, loading, signOut, profile } = useAuth();
  const { t } = useStaffT();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/sign-up-login?next=${encodeURIComponent(pathname || '/')}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Icon name="ArrowPathIcon" size={22} variant="outline" className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl shadow-card p-8 max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Icon name="LockClosedIcon" size={24} variant="outline" className="text-muted-foreground" />
          </div>
          <h1 className="text-[16px] font-600 text-foreground mb-1">{t.layout.staffOnlyTitle}</h1>
          <p className="text-[13px] text-muted-foreground mb-5">{t.layout.staffOnlyBody(user.email ?? '')}</p>
          <button
            onClick={async () => {
              await signOut();
              router.replace('/sign-up-login');
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90"
          >
            {t.layout.signOut}
          </button>
        </div>
      </div>
    );
  }

  if (profile?.mustChangePassword) {
    // Account created / reset by an admin with a temporary password.
    return <ChangePasswordGate />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <Topbar sidebarCollapsed={collapsed} />
      <main
        className={`
          pt-16 min-h-screen content-transition
          ${collapsed ? 'ml-16' : 'ml-60'}
        `}
      >
        {fullBleed ? (
          <div className="h-[calc(100vh-4rem)]">{children}</div>
        ) : (
          <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
