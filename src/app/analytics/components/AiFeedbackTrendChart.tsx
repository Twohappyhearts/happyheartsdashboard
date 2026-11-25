'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FeedbackBucket, FeedbackGroup } from '@/lib/ai-feedback';
import { useStaffT } from '@/lib/i18n/staff/context';

/** Points from fewer ratings than this are drawn hollow. */
export const SMALL_SAMPLE = 5;

const AXIS_WIDTH = 76;
const MARGIN = { top: 22, right: 18, left: 0, bottom: 10 };
const TICK = { fontSize: 11, fill: 'var(--muted-foreground)' };

interface Point {
  label: string;
  usability: number | null;
  nUsability: number;
  safety: number | null;
  nSafety: number;
  rated: number;
  answers: number;
}

function bucketLabel(key: string, bucket: FeedbackBucket, locale: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return bucket === 'month'
    ? date.toLocaleDateString(locale, { month: 'short', year: 'numeric' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function makeDot(color: string, nKey: 'nUsability' | 'nSafety') {
  return function PointDot(props: { cx?: number; cy?: number; value?: number | null; payload?: Point; index?: number }) {
    const { cx, cy, value, payload, index } = props;
    if (value == null || cx == null || cy == null || !payload) return <g key={`dot-${index}`} />;
    const small = payload[nKey] < SMALL_SAMPLE;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={5}
        stroke={color}
        strokeWidth={2}
        fill={small ? 'var(--card)' : color}
      />
    );
  };
}

export default function AiFeedbackTrendChart({ buckets, bucket }: { buckets: FeedbackGroup[]; bucket: FeedbackBucket }) {
  const { t, locale } = useStaffT();
  const T = t.analytics.aiFeedback;
  const data: Point[] = buckets.map((b) => ({
    label: bucketLabel(b.key, bucket, locale),
    usability: b.avgUsability,
    nUsability: b.nUsability,
    safety: b.avgSafety,
    nSafety: b.nSafety,
    rated: b.rated,
    answers: b.answers,
  }));
  const safetyName: Record<number, string> = { 1: T.unsafe, 2: T.concern, 3: T.safe };

  const TooltipBox = ({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p) return null;
    return (
      <div className="bg-card border border-border rounded-lg shadow-modal p-3 text-[11.5px] space-y-0.5">
        <p className="text-[12px] font-600 text-foreground mb-1">{p.label}</p>
        <p className="text-foreground">
          {T.usability}: {p.usability == null ? '—' : p.usability.toFixed(2)} <span className="text-muted-foreground">({T.n(p.nUsability)})</span>
        </p>
        <p className="text-foreground">
          {T.safety}: {p.safety == null ? '—' : p.safety.toFixed(2)} <span className="text-muted-foreground">({T.n(p.nSafety)})</span>
        </p>
        <p className="text-muted-foreground">{T.ratedOf(p.rated, p.answers)}</p>
      </div>
    );
  };

  const heading = (text: string) => <p className="text-[12.5px] font-600 text-foreground mb-1">{text}</p>;

  return (
    <div className="space-y-4">
      <div>
        {heading(T.usability)}
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} syncId="ai-feedback" margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" hide scale="band" />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={AXIS_WIDTH} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipBox />} cursor={{ stroke: 'var(--border)' }} />
            <Line
              type="linear"
              dataKey="usability"
              stroke="var(--accent)"
              strokeWidth={2.5}
              connectNulls
              isAnimationActive={false}
              dot={makeDot('var(--accent)', 'nUsability')}
              activeDot={false}
            >
              <LabelList
                dataKey="usability"
                position="top"
                offset={10}
                style={{ fontSize: 11, fontWeight: 600, fill: 'var(--foreground)' }}
                formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : '')}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        {heading(T.safety)}
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} syncId="ai-feedback" margin={MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" hide scale="band" />
            <YAxis
              domain={[1, 3]}
              ticks={[1, 2, 3]}
              width={AXIS_WIDTH}
              tick={TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => safetyName[v] ?? String(v)}
            />
            <Tooltip content={() => null} cursor={{ stroke: 'var(--border)' }} />
            <Line
              type="linear"
              dataKey="safety"
              stroke="var(--success)"
              strokeWidth={2.5}
              connectNulls
              isAnimationActive={false}
              dot={makeDot('var(--success)', 'nSafety')}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        {heading(T.ratings)}
        <ResponsiveContainer width="100%" height={92}>
          <BarChart data={data} syncId="ai-feedback" margin={{ ...MARGIN, top: 16, bottom: 0 }}>
            <XAxis dataKey="label" tick={TICK} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis width={AXIS_WIDTH} tick={false} axisLine={false} tickLine={false} />
            <Tooltip content={() => null} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
            <Bar dataKey="rated" fill="#CBD5E1" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
              <LabelList
                dataKey="rated"
                position="top"
                style={{ fontSize: 10.5, fill: 'var(--muted-foreground)' }}
                formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? String(v) : '')}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
