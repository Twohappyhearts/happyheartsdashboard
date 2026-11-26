'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import Icon from '@/components/ui/AppIcon';
import Select from '@/components/ui/Select';
import { downloadCsv, todayStamp } from '@/lib/analytics';
import {
  FEEDBACK_BUCKETS,
  FEEDBACK_RANGES,
  FeedbackError,
  feedbackQuery,
  getFeedbackStats,
  readFeedbackQuery,
  type FeedbackAggregate,
  type FeedbackBucket,
  type FeedbackDimension,
  type FeedbackFilters,
  type FeedbackGroup,
  type FeedbackStats,
} from '@/lib/ai-feedback';
import type { ExportFn } from './AnalyticsClient';
import { SMALL_SAMPLE } from './AiFeedbackTrendChart';
import { useStaffT } from '@/lib/i18n/staff/context';
import type { StaffText } from '@/lib/i18n/staff';

type FeedbackText = StaffText['analytics']['aiFeedback'];
type By = 'answer' | 'patient';

const AiFeedbackTrendChart = dynamic(() => import('./AiFeedbackTrendChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[480px] w-full" />,
});

interface Props {
  refreshKey: number;
  onLoaded: () => void;
  onExportReady: (fn: ExportFn) => void;
}

const DIMENSIONS: FeedbackDimension[] = ['source', 'model', 'language'];
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fixed = (v: number | null | undefined, digits = 2) => (v == null ? '—' : v.toFixed(digits));

const LABEL = 'flex flex-col gap-1 text-[11.5px] font-600 text-muted-foreground';
const CARD = 'bg-card rounded-xl border border-border shadow-card';

function Segmented<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="inline-flex gap-0.5 p-0.5 bg-muted rounded-lg">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`h-8 px-3 rounded-md text-[12.5px] transition-colors ${
            value === v ? 'bg-card text-foreground font-600 shadow-card' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function AiFeedbackAnalytics({ refreshKey, onLoaded, onExportReady }: Props) {
  const { t, locale } = useStaffT();
  const T = t.analytics.aiFeedback;
  const router = useRouter();
  const params = useSearchParams();

  const query = readFeedbackQuery(params);
  const filters: FeedbackFilters = { range: query.range, language: query.language, model: query.model };
  const by: By = params.get('by') === 'patient' ? 'patient' : 'answer';
  const bucketParam = params.get('bucket') as FeedbackBucket;
  const bucket: FeedbackBucket = FEEDBACK_BUCKETS.includes(bucketParam) ? bucketParam : 'day';
  const loadKey = `${filters.range}|${filters.language}|${filters.model}|${by}|${bucket}|${refreshKey}`;

  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dimension, setDimension] = useState<FeedbackDimension>('source');

  const setParams = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    p.set('tab', 'ai-feedback');
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/analytics?${p}`, { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFeedbackStats(filters, by, bucket)
      .then((s) => {
        if (cancelled) return;
        setStats(s);
        onLoaded();
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof FeedbackError ? e.message : T.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey, onLoaded]);

  const languageName = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: 'language' });
    } catch {
      names = null;
    }
    return (code: string) => {
      if (code === 'unknown') return T.notSet;
      const name = names?.of(code);
      return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
    };
  }, [locale, T]);

  const groupName = (dim: FeedbackDimension, key: string) =>
    dim === 'source'
      ? (T.sources as Record<string, string>)[key] ?? key
      : dim === 'language'
        ? languageName(key)
        : key === 'unknown'
          ? T.notSet
          : key;

  // Export = every number on the tab.
  useEffect(() => {
    if (!stats) {
      onExportReady(null);
      return;
    }
    const row = (section: string, group: string, a: FeedbackAggregate) => [
      section, group, a.answers, a.rated, a.patients, a.raters, fixed(a.avgUsability), a.top2Share == null ? '' : Math.round(a.top2Share * 1000) / 10,
      a.nUsability, fixed(a.avgSafety), a.safetyCount[2], a.safetyCount[1], a.safetyCount[0], a.nSafety, a.comments,
    ];
    onExportReady(() =>
      downloadCsv(
        `ai-feedback-${by}-${todayStamp()}.csv`,
        [
          'Section', 'Group', 'Answers', 'Rated', 'Patients', 'Patients rating', 'Avg usability', 'Usability 4-5 (%)',
          'Usability n', 'Avg safety', 'Safe', 'Concern', 'Unsafe', 'Safety n', 'Comments',
        ],
        [
          row('Overall', '', stats.overall),
          ...stats.buckets.map((b) => row(T.buckets[bucket], b.key, b)),
          ...DIMENSIONS.flatMap((d) => stats.groups[d].map((g) => row(T.dimensions[d], groupName(d, g.key), g))),
        ],
      ),
    );
    return () => onExportReady(null);
  }, [stats, onExportReady]);

  const answersHref = (extra: { usability?: number; safety?: number } = {}) =>
    `/analytics/ai-feedback/answers?${feedbackQuery({ ...filters, ...extra })}`;

  const filterBar = (
    <div className={`${CARD} px-4 py-3.5 flex flex-wrap items-end gap-3`}>
      <div className={LABEL}>
        {T.dateRange}
        <Select
          aria-label={T.dateRange}
          value={filters.range}
          onValueChange={(v) => setParams({ range: v === '30d' ? null : v })}
          options={FEEDBACK_RANGES.map((r) => ({ value: r, label: T.ranges[r] }))}
          className="min-w-[160px]"
        />
      </div>
      <div className={LABEL}>
        {T.language}
        <Select
          aria-label={T.language}
          value={filters.language ?? ''}
          onValueChange={(v) => setParams({ language: v || null })}
          options={[
            { value: '', label: T.allLanguages },
            ...(stats?.options.languages ?? (filters.language ? [filters.language] : [])).map((l) => ({
              value: l,
              label: languageName(l),
            })),
          ]}
          className="min-w-[160px]"
        />
      </div>
      <div className={LABEL}>
        {T.model}
        <Select
          aria-label={T.model}
          value={filters.model ?? ''}
          onValueChange={(v) => setParams({ model: v || null })}
          options={[
            { value: '', label: T.allModels },
            ...(stats?.options.models ?? (filters.model ? [filters.model] : [])).map((m) => ({
              value: m,
              label: m === 'unknown' ? T.notSet : m,
            })),
          ]}
          className="min-w-[160px] max-w-[260px]"
        />
      </div>
      <div className={`${LABEL} ml-auto`}>
        {T.countBy}
        <Segmented
          value={by}
          options={
            [
              ['answer', T.byAnswer],
              ['patient', T.byPatient],
            ] as [By, string][]
          }
          onChange={(v) => setParams({ by: v === 'answer' ? null : v })}
        />
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-5">
        {filterBar}
        <div className={`${CARD} p-5 flex items-center gap-3`}>
          <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="text-danger shrink-0" />
          <p className="text-[13px] text-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-5">
        {filterBar}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`kpi-skel-${i}`} className="h-[124px] w-full" />
          ))}
        </div>
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  const o = stats.overall;
  const topShare = o.rated ? o.topRater / o.rated : null;
  const maxUsabilityShare = Math.max(0, ...o.usabilityShare.map((s) => s ?? 0));
  const rows = stats.groups[dimension];

  return (
    <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {filterBar}

      {o.answers === 0 ? (
        <div className={`${CARD} p-8 text-center text-[13px] text-muted-foreground`}>{T.noAnswers}</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className={`${CARD} p-4`}>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.coverage}</p>
              <p className="text-[24px] font-700 text-foreground tabular-nums mt-2">{pct(o.rated / o.answers)}</p>
              <p className="text-[11.5px] text-muted-foreground mt-1">{T.ratedOf(o.rated, o.answers)}</p>
              {o.rated > 0 && (
                <Link href={answersHref()} className="inline-block mt-2 text-[12.5px] font-600 text-primary hover:underline">
                  {T.viewAnswers}
                </Link>
              )}
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.usability}</p>
              <p className="text-[24px] font-700 text-foreground tabular-nums mt-2">
                {fixed(o.avgUsability)} <span className="text-[14px] font-500 text-muted-foreground">/ 5</span>
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-1">{T.top2(Math.round((o.top2Share ?? 0) * 100), o.nUsability)}</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.safetyFlags}</p>
              <div className="flex items-baseline gap-4 mt-2">
                <p className="text-[24px] font-700 text-danger tabular-nums">
                  {o.safetyCount[0]} <span className="text-[12.5px] font-600">{T.unsafe}</span>
                </p>
                <p className="text-[24px] font-700 text-warning tabular-nums">
                  {o.safetyCount[1]} <span className="text-[12.5px] font-600">{T.concern}</span>
                </p>
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-1">{T.safeOf(o.safetyCount[2], o.nSafety)}</p>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{T.patientsRating}</p>
              <p className="text-[24px] font-700 text-foreground tabular-nums mt-2">
                {o.raters} <span className="text-[14px] font-500 text-muted-foreground">{T.of(o.patients)}</span>
              </p>
              {topShare != null && (
                <p className={`text-[11.5px] mt-1 ${topShare >= 0.4 ? 'text-warning font-500' : 'text-muted-foreground'}`}>
                  {T.topRater(Math.round(topShare * 100))}
                </p>
              )}
            </div>
          </div>

          {/* Distributions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className={`${CARD} p-5`}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[15px] font-600 text-foreground">{T.usability}</h2>
                <span className="text-[12px] text-muted-foreground">{T.n(o.nUsability)}</span>
              </div>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((score) => {
                  const share = o.usabilityShare[score - 1] ?? 0;
                  const count = o.usabilityCount[score - 1];
                  return (
                    <Link
                      key={score}
                      href={answersHref({ usability: score })}
                      className="flex items-center gap-3 text-[12.5px] rounded-md px-1 py-1 hover:bg-muted"
                    >
                      <span className="w-3 font-600 text-foreground">{score}</span>
                      <span className="flex-1 h-3.5 bg-muted rounded-full overflow-hidden">
                        <span
                          className="block h-full bg-accent rounded-full"
                          style={{ width: maxUsabilityShare ? `${(share / maxUsabilityShare) * 100}%` : 0 }}
                        />
                      </span>
                      <span className="w-[72px] text-right text-muted-foreground tabular-nums">
                        {count} · {pct(share)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className={`${CARD} p-5`}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-[15px] font-600 text-foreground">{T.safety}</h2>
                <span className="text-[12px] text-muted-foreground">{T.n(o.nSafety)}</span>
              </div>
              <div className="flex h-7 rounded-lg overflow-hidden bg-muted">
                <span className="h-full bg-success" style={{ width: pct(o.safetyShare[2] ?? 0) }} />
                <span className="h-full bg-warning" style={{ width: pct(o.safetyShare[1] ?? 0) }} />
                <span className="h-full bg-danger" style={{ width: pct(o.safetyShare[0] ?? 0) }} />
              </div>
              <div className="grid grid-cols-3 gap-2.5 mt-4">
                {(
                  [
                    [3, T.safe, 'bg-success/10 text-success'],
                    [2, T.concern, 'bg-warning/10 text-warning'],
                    [1, T.unsafe, 'bg-danger/10 text-danger'],
                  ] as [number, string, string][]
                ).map(([score, label, cls]) => (
                  <Link key={score} href={answersHref({ safety: score })} className={`rounded-lg p-3 hover:opacity-80 ${cls}`}>
                    <p className="text-[12px] font-600">{label}</p>
                    <p className="text-[20px] font-700 tabular-nums mt-0.5">{o.safetyCount[score - 1]}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Over time */}
          <div className={`${CARD} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-[15px] font-600 text-foreground">{T.overTime}</h2>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                    {T.solid}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-accent bg-card" />
                    {T.hollow}
                  </span>
                </div>
                <Segmented
                  value={bucket}
                  options={FEEDBACK_BUCKETS.map((b) => [b, T.buckets[b]] as [FeedbackBucket, string])}
                  onChange={(v) => setParams({ bucket: v === 'day' ? null : v })}
                />
              </div>
            </div>
            <AiFeedbackTrendChart buckets={stats.buckets} bucket={bucket} />
          </div>

          {/* Compare groups */}
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-600 text-foreground">{T.compare}</h2>
              <Segmented
                value={dimension}
                options={DIMENSIONS.map((d) => [d, T.dimensions[d]] as [FeedbackDimension, string])}
                onChange={setDimension}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="bg-background text-left text-[11px] font-600 text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-2.5 w-[30%]">{T.columns.group}</th>
                    <th className="px-3 py-2.5 text-right">{T.columns.answers}</th>
                    <th className="px-3 py-2.5 w-[20%]">{T.columns.rated}</th>
                    <th className="px-3 py-2.5 w-[26%]">{T.columns.avgUsability}</th>
                    <th className="px-5 py-2.5">{T.columns.flags}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g: FeedbackGroup) => {
                    const small = g.nUsability < SMALL_SAMPLE;
                    const coverage = g.answers ? g.rated / g.answers : 0;
                    return (
                      <tr key={g.key} className={`border-t border-border ${small ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-600 text-foreground break-all">{groupName(dimension, g.key)}</span>
                            {small && (
                              <span className="px-1.5 py-px rounded bg-warning/10 text-[11px] font-600 text-warning">{T.small}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{g.answers}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <span className="block h-full bg-accent" style={{ width: pct(coverage) }} />
                            </span>
                            <span className="w-[72px] text-[12px] text-secondary-foreground tabular-nums">
                              {g.rated} · {pct(coverage)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex-1 h-2 rounded-full bg-muted">
                              {g.avgUsability != null && (
                                <span
                                  className="absolute -top-1 w-4 h-4 -ml-2 rounded-full bg-primary border-2 border-card"
                                  style={{ left: `${((g.avgUsability - 1) / 4) * 100}%` }}
                                />
                              )}
                            </span>
                            <span className="w-9 text-right font-600 tabular-nums">{fixed(g.avgUsability)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-secondary-foreground">
                          {g.nSafety ? T.flags(g.safetyCount[0], g.safetyCount[1]) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
