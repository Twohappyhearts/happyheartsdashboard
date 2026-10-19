'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

import OverallAnalytics from './OverallAnalytics';
import IndividualAnalytics from './IndividualAnalytics';

type Tab = 'overall' | 'individual';

export default function AnalyticsClient() {
  const [activeTab, setActiveTab] = useState<Tab>('overall');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">Analytics</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Patient engagement with educational content — tracked from the mobile app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Last updated: Oct 7, 2026 6:09 AM</span>
          <button
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
          >
            <Icon name="ArrowDownTrayIcon" size={13} variant="outline" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {([
          { key: 'overall', label: 'Overall Analytics' },
          { key: 'individual', label: 'Individual User Analytics' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-4 py-1.5 rounded-md text-[13px] font-600 transition-all duration-150
              ${activeTab === tab.key ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overall' ? <OverallAnalytics /> : <IndividualAnalytics />}
    </div>
  );
}