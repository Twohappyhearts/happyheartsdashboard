'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/LoadingSkeleton';

const WeeklyCompletionsChart = dynamic(() => import('./WeeklyCompletionsChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full" />,
});

const SessionPerformanceTable = dynamic(() => import('./SessionPerformanceTable'), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full" />,
});

const kpiData = [
  { label: 'Total Session Opens', value: '1,284', change: '+18%', positive: true, icon: 'EyeIcon' },
  { label: 'Unique Viewers', value: '47', change: '+3 this week', positive: true, icon: 'UsersIcon' },
  { label: 'Avg Time on Session', value: '6m 42s', change: '-0:28 vs last week', positive: false, icon: 'ClockIcon' },
  { label: 'Completion Rate', value: '61.4%', change: '+4.2%', positive: true, icon: 'CheckCircleIcon' },
  { label: 'Video Play Taps', value: '892', change: '+12%', positive: true, icon: 'PlayIcon' },
  { label: 'Infographic Opens', value: '534', change: '+8%', positive: true, icon: 'PhotoIcon' },
];

import Icon from '@/components/ui/AppIcon';

export default function OverallAnalytics() {
  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiData.map((kpi) => (
          <div key={`kpi-${kpi.label}`} className="bg-card rounded-xl border border-border shadow-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider leading-tight">{kpi.label}</p>
              <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={14} variant="outline" className="text-muted-foreground shrink-0" />
            </div>
            <p className="text-[24px] font-700 text-foreground tabular-nums">{kpi.value}</p>
            <p className={`text-[11px] font-500 mt-1 ${kpi.positive ? 'text-success' : 'text-danger'}`}>
              {kpi.positive ? '↑' : '↓'} {kpi.change}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-card rounded-xl border border-border shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-600 text-foreground">Weekly Session Completions</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Completions per session over the past 8 weeks</p>
          </div>
        </div>
        <WeeklyCompletionsChart />
      </div>

      {/* Session Performance Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-600 text-foreground">All Content Performance</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">Engagement metrics per session — sorted by completion rate</p>
        </div>
        <SessionPerformanceTable />
      </div>
    </div>
  );
}