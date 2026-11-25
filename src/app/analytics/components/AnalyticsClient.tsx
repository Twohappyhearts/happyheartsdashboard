'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

import OverallAnalytics from './OverallAnalytics';
import IndividualAnalytics from './IndividualAnalytics';
import AiFeedbackAnalytics from './AiFeedbackAnalytics';
import { useStaffT } from '@/lib/i18n/staff/context';

type Tab = 'overall' | 'individual' | 'aiFeedback';

/** Each tab registers how to export what it is currently showing. */
export type ExportFn = (() => void) | null;

export default function AnalyticsClient() {
  const { t, locale } = useStaffT();
  const T = t.analytics;
  const router = useRouter();
  const searchParams = useSearchParams();
  // AI Feedback keeps its tab and filters in the URL (?tab=ai-feedback&…), so its pages link back to it.
  const [activeTab, setActiveTab] = useState<Tab>(searchParams.get('tab') === 'ai-feedback' ? 'aiFeedback' : 'overall');
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [canExport, setCanExport] = useState(false);
  const exportRef = useRef<ExportFn>(null);

  const handleLoaded = useCallback(() => setLastUpdated(new Date()), []);
  const handleExportReady = useCallback((fn: ExportFn) => {
    exportRef.current = fn;
    setCanExport(fn !== null);
  }, []);

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return;
    exportRef.current = null;
    setCanExport(false);
    setActiveTab(tab);
    router.replace(tab === 'aiFeedback' ? '/analytics?tab=ai-feedback' : '/analytics', { scroll: false });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {lastUpdated
              ? T.lastUpdated(
                  lastUpdated.toLocaleString(locale, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                )
              : T.loading}
          </span>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            title={T.refresh}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
          >
            <Icon name="ArrowPathIcon" size={13} variant="outline" />
            {T.refresh}
          </button>
          <button
            onClick={() => exportRef.current?.()}
            disabled={!canExport}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="ArrowDownTrayIcon" size={13} variant="outline" />
            {T.exportCsv}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {([
          { key: 'overall', label: T.tabOverall },
          { key: 'individual', label: T.tabIndividual },
          { key: 'aiFeedback', label: T.tabAiFeedback },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={`tab-${tab.key}`}
            onClick={() => switchTab(tab.key)}
            className={`
              px-4 py-1.5 rounded-md text-[13px] font-600 transition-all duration-150
              ${activeTab === tab.key ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overall' ? (
        <OverallAnalytics refreshKey={refreshKey} onLoaded={handleLoaded} onExportReady={handleExportReady} />
      ) : activeTab === 'individual' ? (
        <IndividualAnalytics refreshKey={refreshKey} onLoaded={handleLoaded} onExportReady={handleExportReady} />
      ) : (
        <AiFeedbackAnalytics refreshKey={refreshKey} onLoaded={handleLoaded} onExportReady={handleExportReady} />
      )}
    </div>
  );
}
