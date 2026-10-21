'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import {
  AnalyticsError,
  downloadCsv,
  fmtDuration,
  getContentPerformance,
  getOverview,
  getWeekly,
  todayStamp,
  type ContentPerformance,
  type OverviewStats,
  type WeeklyPoint,
} from '@/lib/analytics';
import type { ExportFn } from './AnalyticsClient';

const WeeklyCompletionsChart = dynamic(() => import('./WeeklyCompletionsChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full" />,
});

const SessionPerformanceTable = dynamic(() => import('./SessionPerformanceTable'), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full" />,
});

interface Props {
  refreshKey: number;
  onLoaded: () => void;
  onExportReady: (fn: ExportFn) => void;
}

interface Data {
  all: OverviewStats;
  thisWeek: OverviewStats;
  lastWeek: OverviewStats;
  weekly: WeeklyPoint[];
  content: ContentPerformance[];
}

type Trend = 'up' | 'down' | 'flat';

interface Kpi {
  label: string;
  value: string;
  change: string;
  trend: Trend;
  icon: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** "+18% vs last week" for counts, falling back to "+3 this week". */
function countChange(cur: number, prev: number): { change: string; trend: Trend } {
  if (prev > 0) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { change: `${pct >= 0 ? '+' : ''}${pct}% vs last week`, trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }
  return cur > 0 ? { change: `+${cur} this week`, trend: 'up' } : { change: 'None this week', trend: 'flat' };
}

function buildKpis(d: Data): Kpi[] {
  const { all, thisWeek: tw, lastWeek: lw } = d;

  const timeDiff = tw.avgTimeSec - lw.avgTimeSec;
  const timeTrend: Trend = tw.sessionOpens === 0 || lw.sessionOpens === 0 || timeDiff === 0 ? 'flat' : timeDiff > 0 ? 'up' : 'down';
  const timeChange =
    tw.sessionOpens === 0
      ? 'No visits this week'
      : lw.sessionOpens === 0
        ? `${fmtDuration(tw.avgTimeSec)} this week`
        : `${timeDiff >= 0 ? '+' : '-'}${fmtDuration(Math.abs(timeDiff))} vs last week`;

  const rateDiff = Math.round((tw.completionRate - lw.completionRate) * 10) / 10;
  const rateTrend: Trend = tw.sessionOpens === 0 || lw.sessionOpens === 0 || rateDiff === 0 ? 'flat' : rateDiff > 0 ? 'up' : 'down';
  const rateChange =
    tw.sessionOpens === 0
      ? 'No visits this week'
      : lw.sessionOpens === 0
        ? `${tw.completionRate.toFixed(1)}% this week`
        : `${rateDiff >= 0 ? '+' : ''}${rateDiff.toFixed(1)} pts vs last week`;

  return [
    { label: 'Total Session Opens', value: all.sessionOpens.toLocaleString(), ...countChange(tw.sessionOpens, lw.sessionOpens), icon: 'EyeIcon' },
    {
      label: 'Unique Viewers',
      value: all.uniqueViewers.toLocaleString(),
      change: `${tw.uniqueViewers} active this week`,
      trend: tw.uniqueViewers > 0 ? 'up' : 'flat',
      icon: 'UsersIcon',
    },
    { label: 'Avg Time on Session', value: all.sessionOpens ? fmtDuration(all.avgTimeSec) : '—', change: timeChange, trend: timeTrend, icon: 'ClockIcon' },
    { label: 'Completion Rate', value: `${all.completionRate.toFixed(1)}%`, change: rateChange, trend: rateTrend, icon: 'CheckCircleIcon' },
    { label: 'Video Play Taps', value: all.videoPlays.toLocaleString(), ...countChange(tw.videoPlays, lw.videoPlays), icon: 'PlayIcon' },
    { label: 'Infographic Opens', value: all.infographicOpens.toLocaleString(), ...countChange(tw.infographicOpens, lw.infographicOpens), icon: 'PhotoIcon' },
  ];
}

export default function OverallAnalytics({ refreshKey, onLoaded, onExportReady }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
    setLoading(true);
    setError(null);
    Promise.all([
      getOverview(supabase),
      getOverview(supabase, weekAgo),
      getOverview(supabase, twoWeeksAgo, weekAgo),
      getWeekly(supabase, 8),
      getContentPerformance(supabase),
    ])
      .then(([all, thisWeek, lastWeek, weekly, content]) => {
        if (cancelled) return;
        setData({ all, thisWeek, lastWeek, weekly, content });
        onLoaded();
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof AnalyticsError ? e.message : 'Could not load analytics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, onLoaded]);

  // Export = the "All Content Performance" table.
  useEffect(() => {
    if (!data) {
      onExportReady(null);
      return;
    }
    const rows = data.content;
    onExportReady(() =>
      downloadCsv(
        `content-performance-${todayStamp()}.csv`,
        [
          'Session', 'Group ID', 'Category', 'Visible in app', 'Opens', 'Unique viewers', 'Avg time (s)', 'Total time (s)',
          'Video plays', 'Video watch time (s)', 'Audio plays', 'Audio listen time (s)', 'Infographic opens',
          'Avg infographic time (s)', 'Notes reads (>=5s)', 'Notes reading time (s)', 'Quiz starts', 'Quiz finished (patients)',
          'Completions (patients)', 'Completion rate (%)',
        ],
        rows.map((r) => [
          r.title, r.groupId, r.category ?? '', r.active ? 'yes' : 'no', r.opens, r.uniqueViewers, r.avgTimeSec, r.totalTimeSec,
          r.videoTaps, r.videoSec, r.audioTaps, r.audioSec, r.infographicOpens, r.avgInfographicSec, r.scriptReads,
          r.scriptSec, r.quizTaps, r.quizCompletions, r.completions, r.completionRate,
        ]),
      ),
    );
    return () => onExportReady(null);
  }, [data, onExportReady]);

  const kpis = useMemo(() => (data ? buildKpis(data) : []), [data]);

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-card p-5 flex items-center gap-3">
        <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="text-danger shrink-0" />
        <p className="text-[13px] text-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {loading && !data
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={`kpi-skel-${i}`} className="h-[104px] w-full" />)
          : kpis.map((kpi) => (
              <div key={`kpi-${kpi.label}`} className="bg-card rounded-xl border border-border shadow-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider leading-tight">{kpi.label}</p>
                  <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={14} variant="outline" className="text-muted-foreground shrink-0" />
                </div>
                <p className="text-[24px] font-700 text-foreground tabular-nums">{kpi.value}</p>
                <p
                  className={`text-[11px] font-500 mt-1 ${
                    kpi.trend === 'up' ? 'text-success' : kpi.trend === 'down' ? 'text-danger' : 'text-muted-foreground'
                  }`}
                >
                  {kpi.trend === 'up' ? '↑ ' : kpi.trend === 'down' ? '↓ ' : ''}
                  {kpi.change}
                </p>
              </div>
            ))}
      </div>

      {/* Chart */}
      <div className="bg-card rounded-xl border border-border shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-600 text-foreground">Weekly Session Completions</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Lesson opens and first-time completions per week over the past 8 weeks</p>
          </div>
        </div>
        {data ? <WeeklyCompletionsChart data={data.weekly} /> : <Skeleton className="h-[260px] w-full" />}
      </div>

      {/* Session Performance Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-600 text-foreground">All Content Performance</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">Engagement metrics per session — sorted by completion rate</p>
        </div>
        {data ? <SessionPerformanceTable rows={data.content} /> : <Skeleton className="h-[400px] w-full" />}
      </div>
    </div>
  );
}
