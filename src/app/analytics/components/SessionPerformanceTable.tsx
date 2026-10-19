'use client';

import React, { useState } from 'react';


interface SessionMetrics {
  id: string;
  title: string;
  opens: number;
  uniqueViewers: number;
  avgTimeSec: number;
  videoTaps: number;
  audioTaps: number;
  infographicOpens: number;
  avgInfographicSec: number;
  quizTaps: number;
  completions: number;
  completionRate: number;
}

const sessionData: SessionMetrics[] = [
  { id: 'sm-001', title: 'Understanding Heart Failure', opens: 218, uniqueViewers: 47, avgTimeSec: 487, videoTaps: 162, audioTaps: 94, infographicOpens: 88, avgInfographicSec: 42, quizTaps: 0, completions: 141, completionRate: 64.7 },
  { id: 'sm-002', title: 'Managing Your Medications', opens: 195, uniqueViewers: 44, avgTimeSec: 612, videoTaps: 148, audioTaps: 87, infographicOpens: 0, avgInfographicSec: 0, quizTaps: 22, completions: 127, completionRate: 65.1 },
  { id: 'sm-003', title: 'Daily Weight Monitoring', opens: 182, uniqueViewers: 43, avgTimeSec: 390, videoTaps: 0, audioTaps: 104, infographicOpens: 71, avgInfographicSec: 38, quizTaps: 0, completions: 108, completionRate: 59.3 },
  { id: 'sm-004', title: 'Low-Sodium Diet Guide', opens: 174, uniqueViewers: 41, avgTimeSec: 528, videoTaps: 131, audioTaps: 0, infographicOpens: 94, avgInfographicSec: 55, quizTaps: 18, completions: 99, completionRate: 56.9 },
  { id: 'sm-005', title: 'Exercise & Physical Activity', opens: 88, uniqueViewers: 29, avgTimeSec: 342, videoTaps: 64, audioTaps: 41, infographicOpens: 0, avgInfographicSec: 0, quizTaps: 9, completions: 41, completionRate: 46.6 },
  { id: 'sm-006', title: 'Recognizing Warning Signs', opens: 163, uniqueViewers: 40, avgTimeSec: 574, videoTaps: 122, audioTaps: 78, infographicOpens: 82, avgInfographicSec: 61, quizTaps: 15, completions: 104, completionRate: 63.8 },
  { id: 'sm-007', title: 'Stress Management Techniques', opens: 141, uniqueViewers: 38, avgTimeSec: 423, videoTaps: 0, audioTaps: 98, infographicOpens: 0, avgInfographicSec: 0, quizTaps: 11, completions: 79, completionRate: 56.0 },
];

function fmtTime(sec: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

type SortKey = keyof SessionMetrics;

export default function SessionPerformanceTable() {
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
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className={`ml-1 text-[10px] ${sortKey === col ? 'text-primary' : 'text-muted-foreground'}`}>
      {sortKey === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  );

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[1100px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {[
              { key: 'title', label: 'Session', sortable: false },
              { key: 'opens', label: 'Opens', sortable: true },
              { key: 'uniqueViewers', label: 'Unique', sortable: true },
              { key: 'avgTimeSec', label: 'Avg Time', sortable: true },
              { key: 'videoTaps', label: '▶ Video', sortable: true },
              { key: 'audioTaps', label: '♪ Audio', sortable: true },
              { key: 'infographicOpens', label: '🖼 Infographic', sortable: true },
              { key: 'avgInfographicSec', label: 'Infographic Time', sortable: true },
              { key: 'quizTaps', label: 'Quiz Taps', sortable: true },
              { key: 'completions', label: 'Completions', sortable: true },
              { key: 'completionRate', label: 'Rate', sortable: true },
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
              <td className="px-4 py-3 text-[13px] font-500 text-foreground max-w-[200px] truncate">{row.title}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.opens}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.uniqueViewers}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.avgTimeSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.videoTaps || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.audioTaps || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.infographicOpens || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{fmtTime(row.avgInfographicSec)}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums text-foreground">{row.quizTaps || '—'}</td>
              <td className="px-4 py-3 text-[13px] tabular-nums font-600 text-foreground">{row.completions}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${row.completionRate}%` }}
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