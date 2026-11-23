'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Opens the list of past conversations. A labeled button, not a bare ☰: the app's own ☰
 * (side menu) sits right above this page, and testers did not find their old chats behind
 * a second identical icon.
 */
export default function HistoryButton({ label, ariaLabel, onClick }: { label: string; ariaLabel: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-9 shrink-0 px-2.5 rounded-lg flex items-center gap-1.5 bg-muted text-[13px] font-500 active:opacity-70"
      aria-label={ariaLabel}
    >
      <Icon name="ClockIcon" size={16} variant="outline" />
      {label}
    </button>
  );
}
