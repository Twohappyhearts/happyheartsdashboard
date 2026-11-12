'use client';

import React, { useState } from 'react';


import type { ContentPerformance } from '@/lib/analytics';
import { fmtDuration } from '@/lib/analytics';
import { useStaffT } from '@/lib/i18n/staff/context';

type SessionMetrics = ContentPerformance;

function fmtTime(sec: number): string {
  if (!sec) return '—';
  return fmtDuration(sec);
}

type SortKey = keyof SessionMetrics;

export default function SessionPerformanceTable({ rows: sessionData }: { rows: SessionMetrics[] }) {
  const T = useStaffT().t.analytics.table;
  const [sortKey, setSortKey] = useState<SortKey>('completionRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...sessionData].sort((a, b) => {
    const av = Number(a[sortKey]) || 0;
    const bv = Number(b[sortKey]) || 0;
    if (av === bv) return b.opens - a.opens; // stable, busiest first
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  if (sessionData.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
        {T.empty}
      </p>
    );
  }

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className={`ml-1 text-[10px] ${sortKey === col ? 'text-primary' : 'text-muted-foreground'}`}>
      {sortKey === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[1400px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {[
              { key: 'title', label: T.title, sortable: false },
              { key: 'opens', label: T.opens, sortable: true },
              { key: 'uniqueViewers', label: T.uniqueViewers, sortable: true },
              { key: 'avgTimeSec', label: T.avgTimeSec, sortable: true },
              { key: 'videoTaps', label: T.videoTaps, sortable: true },
              { key: 'videoSec', label: T.videoSec, sortable: true },
              { key: 'audioTaps', label: T.audioTaps, sortable: true },
              { key: 'audioSec', label: T.audioSec, sortable: true },
              { key: 'infographicOpens', label: T.infographicOpens, sortable: true },
              { key: 'avgInfographicSec', label: T.avgInfographicSec, sortable: true },
              { key: 'scriptSec', label: T.scriptSec, sortable: true },
              { key: 'quizTaps', label: T.quizTaps, sortable: true },
              { key: 'quizCompletions', label: T.quizCompletions, sortable: true },
              { key: 'completions', label: T.completions, sortable: true },
              { key: 'completionRate', label: T.completionRate, sortable: true },
            ].map((col) => (
              <th
                key={`th-${col.key}`}
                onClick={() => col.sortable && handleSort(col.key as SortKey)}
                className={`
                  text-left px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider whitespace-nowrap
                  ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''}
                  ${sortKey === col.key ? 'text-primary' : ''}
                `}
              >
                {col.label}
                {col.sortable && <SortIcon col={col.key as SortKey} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors duration-100">
              <td className="px-4 py-3 max-w-[220px]">
                <p className="text-[13px] font-500 text-foreground truncate" title={row.title}>{row.title}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  {row.groupId}
                  {!row.active && <span className="ml-1.5 font-sans text-warning">{T.hidden}</span>}
                </p>
              </td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.opens}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.uniqueViewers}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.avgTimeSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.videoTaps || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.videoSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.audioTaps || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.audioSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.infographicOpens || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.avgInfographicSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.scriptSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.quizTaps || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.quizCompletions || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums font-600 text-foreground">{row.completions}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.min(100, row.completionRate)}%` }}
                    />
                  </div>
                  <span className={`text-[12px] font-600 tabular-nums ${row.completionRate >= 60 ? 'text-success' : row.completionRate >= 50 ? 'text-warning' : 'text-danger'}`}>
                    {row.completionRate.toFixed(1)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}