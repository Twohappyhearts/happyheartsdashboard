'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

interface TopbarProps {
  sidebarCollapsed: boolean;
  alertCount?: number;
}

export default function Topbar({ sidebarCollapsed, alertCount = 3 }: TopbarProps) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

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
          HappyHearts Admin
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[13px] hover:bg-secondary transition-colors duration-150">
          <Icon name="MagnifyingGlassIcon" size={14} variant="outline" />
          <span>Search...</span>
          <span className="text-[10px] border border-border rounded px-1 py-0.5 ml-1">⌘K</span>
        </button>

        {/* Alerts bell */}
        <Link
          href="/alerts"
          className="relative p-2 rounded-lg hover:bg-muted transition-colors duration-150"
          title="View Alerts"
        >
          <Icon name="BellIcon" size={18} variant="outline" className="text-secondary-foreground" />
          {alertCount > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] font-700 rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {alertCount}
            </span>
          )}
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* User avatar */}
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors duration-150">
          <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-700">
            SC
          </div>
          <div className="hidden md:block text-left">
            <p className="text-[12px] font-600 text-foreground leading-tight">Sarah Chen</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Coordinator</p>
          </div>
          <Icon name="ChevronDownIcon" size={14} variant="outline" className="text-muted-foreground hidden md:block" />
        </button>
      </div>
    </header>
  );
}