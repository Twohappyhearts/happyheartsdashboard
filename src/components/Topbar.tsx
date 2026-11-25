'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { displayName, initials, useAuth } from '@/contexts/AuthContext';
import { useOpenAlerts } from '@/contexts/OpenAlertsContext';
import { useInbox } from '@/contexts/InboxContext';
import { useStaffT } from '@/lib/i18n/staff/context';
import LanguageSwitch from '@/components/LanguageSwitch';

interface TopbarProps {
  sidebarCollapsed: boolean;
}

export default function Topbar({ sidebarCollapsed }: TopbarProps) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const { profile, user } = useAuth();
  const { openCount: alertCount } = useOpenAlerts();
  const { unread: inboxUnread } = useInbox();
  const { t } = useStaffT();
  const name = profile?.fullName?.trim() || user?.email || displayName(profile);
  const roleLabel = profile?.role === 'admin' ? t.topbar.roleAdmin : t.topbar.roleStaff;

  const sidebarWidth = sidebarCollapsed ? 'ml-16' : 'ml-60';

  return (
    <header
      className={`
        fixed top-0 right-0 h-16 bg-card border-b border-border z-20
        flex items-center justify-between px-6
        sidebar-transition
        ${sidebarWidth} left-0
      `}
    >
      {/* Left: Page context is handled per-page */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-500 text-muted-foreground uppercase tracking-widest">
          {t.topbar.brand}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Dashboard language: English / Español (cookie hh_staff_lang) */}
        <LanguageSwitch />

        {/* Inbox: broadcast messages sent to this staff member */}
        <Link
          href="/inbox"
          className="relative p-2 rounded-lg hover:bg-muted transition-colors duration-150"
          title={inboxUnread > 0 ? t.topbar.unreadInbox(inboxUnread) : t.topbar.inbox}
        >
          <Icon name="InboxIcon" size={18} variant="outline" className="text-secondary-foreground" />
          {inboxUnread > 0 && (
            <span className="absolute top-1 right-1 bg-blue-500 text-white text-[9px] font-700 rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {inboxUnread > 99 ? '99+' : inboxUnread}
            </span>
          )}
        </Link>

        {/* Alerts bell */}
        <Link
          href="/alerts"
          className="relative p-2 rounded-lg hover:bg-muted transition-colors duration-150"
          title={alertCount > 0 ? t.topbar.openAlerts(alertCount) : t.topbar.noOpenAlerts}
        >
          <Icon name="BellIcon" size={18} variant="outline" className="text-secondary-foreground" />
          {alertCount > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] font-700 rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* User avatar */}
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors duration-150">
          <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-700">
            {initials(name)}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-[12px] font-600 text-foreground leading-tight max-w-[180px] truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{roleLabel}</p>
          </div>
          <Icon name="ChevronDownIcon" size={14} variant="outline" className="text-muted-foreground hidden md:block" />
        </button>
      </div>
    </header>
  );
}