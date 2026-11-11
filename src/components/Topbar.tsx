'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { displayName, initials, useAuth } from '@/contexts/AuthContext';
import { useOpenAlerts } from '@/contexts/OpenAlertsContext';
import { useStaffT } from '@/lib/i18n/staff/context';
import { STAFF_LANGS, STAFF_LANG_NAMES } from '@/lib/i18n/staff';

interface TopbarProps {
  sidebarCollapsed: boolean;
}

export default function Topbar({ sidebarCollapsed }: TopbarProps) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const { profile, user } = useAuth();
  const { openCount: alertCount } = useOpenAlerts();
  const { t, lang, setLang } = useStaffT();
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
        <div
          role="group"
          aria-label={t.language.label}
          title={lang === 'es' ? t.language.note : t.language.label}
          className="flex items-center gap-0.5 p-0.5 bg-muted rounded-lg"
        >
          <Icon name="LanguageIcon" size={15} variant="outline" className="text-muted-foreground mx-1" />
          {STAFF_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={lang === l}
              onClick={() => lang !== l && setLang(l)}
              className={`px-2 py-1 rounded-md text-[12px] font-600 transition-colors duration-150 ${
                lang === l ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {STAFF_LANG_NAMES[l]}
            </button>
          ))}
        </div>

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