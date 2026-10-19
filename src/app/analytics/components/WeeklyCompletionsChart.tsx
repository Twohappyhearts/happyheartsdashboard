'use client';

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const data = [
  { week: 'Aug 18', completions: 24, opens: 41 },
  { week: 'Aug 25', completions: 31, opens: 52 },
  { week: 'Sep 1', completions: 28, opens: 48 },
  { week: 'Sep 8', completions: 45, opens: 67 },
  { week: 'Sep 15', completions: 38, opens: 59 },
  { week: 'Sep 22', completions: 52, opens: 78 },
  { week: 'Sep 29', completions: 47, opens: 71 },
  { week: 'Oct 6', completions: 61, opens: 88 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-modal p-3">
      <p className="text-[12px] font-600 text-foreground mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={`tooltip-${entry.name}`} className="text-[11px] font-500" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
      {payload.length === 2 && (
        <p className="text-[11px] text-muted-foreground mt-1">
          Rate: {Math.round((payload[0].value / payload[1].value) * 100)}%
        </p>
      )}
    </div>
  );
};

export default function WeeklyCompletionsChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={4} barCategoryGap="30%">
        <defs>
          <linearGradient id="barCompletions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="barOpens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.7} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
          formatter={(value) => <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>{value}</span>}
        />
        <Bar dataKey="opens" name="Session Opens" fill="url(#barOpens)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="completions" name="Completions" fill="url(#barCompletions)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}