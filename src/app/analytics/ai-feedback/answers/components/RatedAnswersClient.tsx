'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Select from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import {
  FEEDBACK_RANGES,
  FeedbackError,
  exportRatedAnswers,
  feedbackQuery,
  getFeedbackStats,
  listRatedAnswers,
  plainPreview,
  readFeedbackQuery,
  type RatedAnswer,
  type RatedAnswerFacets,
} from '@/lib/ai-feedback';
import { useStaffT } from '@/lib/i18n/staff/context';
import type { StaffText } from '@/lib/i18n/staff';

type FeedbackText = StaffText['analytics']['aiFeedback'];

const LABEL = 'flex flex-col gap-1 text-[11.5px] font-600 text-muted-foreground';
const CARD = 'bg-card rounded-xl border border-border shadow-card';
const PREVIEW_CHARS = 260;

function AnswerCard({ a, T, when, language }: { a: RatedAnswer; T: FeedbackText; when: string; language: string }) {
  const [open, setOpen] = useState(false);
  const preview = plainPreview(a.answer);
  const long = preview.length > PREVIEW_CHARS || preview.split('\n').length > 3;
  const safety =
    a.safety === 3
      ? { label: T.safe, cls: 'bg-success/10 text-success' }
      : a.safety === 2
        ? { label: T.concern, cls: 'bg-warning/10 text-warning' }
        : a.safety === 1
          ? { label: T.unsafe, cls: 'bg-danger/10 text-danger' }
          : null;
  return (
    <article className={`${CARD} px-5 py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          <span className="font-mono font-600 text-foreground">{a.participant ?? T.answers.unknownParticipant}</span>
          {' · '}
          {when} · {language} · {a.model === 'unknown' ? T.notSet : a.model}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {a.usability != null && (
            <span
              className={`px-2 py-0.5 rounded-md text-[12px] font-600 ${
                a.usability <= 2 ? 'bg-danger/10 text-danger' : 'bg-muted text-foreground'
              }`}
            >
              {T.answers.usabilityScore(a.usability)}
            </span>
          )}
          {safety && <span className={`px-2 py-0.5 rounded-md text-[12px] font-600 ${safety.cls}`}>{safety.label}</span>}
          <Link
            href={`/ai-conversations?c=${encodeURIComponent(a.conversationId)}&m=${encodeURIComponent(a.messageId)}`}
            target="_blank"
            rel="noopener"
            className="ml-1 text-[12.5px] font-600 text-primary hover:underline"
          >
            {T.answers.openConversation}
          </Link>
        </div>
      </div>
      {a.question && <p className="mt-3 text-[14px] font-600 text-foreground leading-snug whitespace-pre-wrap break-words">{a.question}</p>}
      <p className={`mt-1.5 text-[13px] leading-relaxed text-secondary-foreground whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-3'}`}>
        {preview}
      </p>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1 text-[12px] font-600 text-primary hover:underline">
          {open ? T.answers.showLess : T.answers.showMore}
        </button>
      )}
      {a.comment && (
        <blockquote className="mt-3 px-3 py-2.5 rounded-lg bg-background text-[13px] leading-relaxed text-secondary-foreground italic whitespace-pre-wrap break-words">
          “{a.comment}”
        </blockquote>
      )}
    </article>
  );
}

export default function RatedAnswersClient() {
  const { t, locale } = useStaffT();
  const T = t.analytics.aiFeedback;
  const router = useRouter();
  const params = useSearchParams();
  const filters = readFeedbackQuery(params);
  const listKey = feedbackQuery(filters);

  const [search, setSearch] = useState(filters.search);
  const [answers, setAnswers] = useState<RatedAnswer[]>([]);
  const [facets, setFacets] = useState<RatedAnswerFacets | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [options, setOptions] = useState<{ languages: string[] } | null>(null);
  const request = useRef(0);

  const setParams = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/analytics/ai-feedback/answers?${p}`, { scroll: false });
  };

  // Search as you type (debounced) into the URL.
  useEffect(() => {
    if (search.trim() === filters.search) return;
    const id = setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    const req = ++request.current;
    setLoading(true);
    setError(null);
    listRatedAnswers(filters, null)
      .then((page) => {
        if (req !== request.current) return;
        setAnswers(page.answers);
        setNext(page.next);
        setFacets(page.facets);
      })
      .catch((e) => {
        if (req === request.current) setError(e instanceof FeedbackError ? e.message : T.answers.loadFailed);
      })
      .finally(() => {
        if (req === request.current) setLoading(false);
      });
  }, [listKey]);

  // Languages that have answers in the range (for the Language filter).
  useEffect(() => {
    let cancelled = false;
    getFeedbackStats({ range: filters.range, language: null, model: null }, 'answer', 'month')
      .then((s) => {
        if (!cancelled) setOptions({ languages: s.options.languages });
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.range]);

  const loadMore = async () => {
    if (!next || loadingMore) return;
    const req = request.current;
    setLoadingMore(true);
    try {
      const page = await listRatedAnswers(filters, next);
      if (req !== request.current) return;
      setAnswers((list) => [...list, ...page.answers.filter((a) => !list.some((x) => x.messageId === a.messageId))]);
      setNext(page.next);
    } catch (e) {
      toast.error(e instanceof FeedbackError ? e.message : T.answers.loadFailed);
    } finally {
      setLoadingMore(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportRatedAnswers(filters);
    } catch (e) {
      toast.error(e instanceof FeedbackError ? e.message : T.answers.exportFailed);
    } finally {
      setExporting(false);
    }
  };

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

  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const languages = options?.languages ?? (filters.language ? [filters.language] : []);
  const backHref = `/analytics?${feedbackQuery({ range: filters.range, language: filters.language, model: filters.model }, { tab: 'ai-feedback' })}`;

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`h-8 px-3 rounded-full border text-[12px] font-600 transition-colors ${
        on ? 'bg-foreground border-foreground text-card' : 'bg-card border-border text-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={backHref} className="text-[12.5px] font-600 text-primary hover:underline">
            ← {T.answers.back}
          </Link>
          <h1 className="text-[22px] font-700 text-foreground mt-1">
            {T.answers.title}
            {facets && (
              <span className="ml-2 text-[15px] font-500 text-muted-foreground tabular-nums">
                {filters.usability ? facets.usability[filters.usability - 1] : facets.total}
              </span>
            )}
          </h1>
        </div>
        <button
          onClick={doExport}
          disabled={exporting || !facets?.total}
          className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="ArrowDownTrayIcon" size={13} variant="outline" />
          {t.analytics.exportCsv}
        </button>
      </div>

      <div className={`${CARD} px-4 py-3.5 flex flex-wrap items-end gap-3`}>
        <label className={`${LABEL} flex-1 min-w-[240px]`}>
          {T.answers.search}
          <span className="relative">
            <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={T.answers.searchPlaceholder}
              className="w-full h-9 pl-8 pr-3 bg-background border border-border rounded-lg text-[13px] font-400 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </span>
        </label>
        <div className={LABEL}>
          {T.safety}
          <Select
            aria-label={T.safety}
            value={filters.safety ? String(filters.safety) : ''}
            onValueChange={(v) => setParams({ safety: v || null })}
            options={[
              { value: '', label: T.answers.all },
              { value: '3', label: T.safe },
              { value: '2', label: T.concern },
              { value: '1', label: T.unsafe },
            ]}
            className="min-w-[130px]"
          />
        </div>
        <div className={LABEL}>
          {T.language}
          <Select
            aria-label={T.language}
            value={filters.language ?? ''}
            onValueChange={(v) => setParams({ language: v || null })}
            options={[{ value: '', label: T.allLanguages }, ...languages.map((l) => ({ value: l, label: languageName(l) }))]}
            className="min-w-[140px]"
          />
        </div>
        <div className={LABEL}>
          {T.dateRange}
          <Select
            aria-label={T.dateRange}
            value={filters.range}
            onValueChange={(v) => setParams({ range: v === '30d' ? null : v })}
            options={FEEDBACK_RANGES.map((r) => ({ value: r, label: T.ranges[r] }))}
            className="min-w-[150px]"
          />
        </div>
        {filters.model && (
          <span className="h-9 inline-flex items-center gap-1.5 pl-3 pr-1.5 rounded-lg bg-muted text-[12.5px] text-foreground">
            {T.model}: {filters.model === 'unknown' ? T.notSet : filters.model}
            <button onClick={() => setParams({ model: null })} aria-label={T.allModels} className="p-1 rounded hover:bg-card">
              <Icon name="XMarkIcon" size={12} variant="outline" />
            </button>
          </span>
        )}
        <label className="h-9 inline-flex items-center gap-2 px-3 border border-border rounded-lg text-[13px] text-foreground cursor-pointer">
          <input type="checkbox" checked={filters.withComment} onChange={(e) => setParams({ comment: e.target.checked ? '1' : null })} />
          {T.answers.withComment(facets?.comments ?? 0)}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-600 text-muted-foreground mr-1">{T.usability}</span>
        {chip(T.answers.chipAll(facets?.total ?? 0), filters.usability == null, () => setParams({ usability: null }))}
        {[1, 2, 3, 4, 5].map((score) =>
          chip(T.answers.chipScore(score, facets?.usability[score - 1] ?? 0), filters.usability === score, () =>
            setParams({ usability: String(score) }),
          ),
        )}
      </div>

      {error ? (
        <div className={`${CARD} p-5 flex items-center gap-3`}>
          <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="text-danger shrink-0" />
          <p className="text-[13px] text-foreground">{error}</p>
        </div>
      ) : loading && answers.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`ans-skel-${i}`} className="h-[150px] w-full" />
          ))}
        </div>
      ) : answers.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-[13px] text-muted-foreground`}>{T.answers.empty}</div>
      ) : (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {answers.map((a) => (
            <AnswerCard key={a.messageId} a={a} T={T} when={when(a.answeredAt)} language={languageName(a.language)} />
          ))}
          {next && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="h-9 px-4 border border-border rounded-lg bg-card text-[13px] font-600 text-foreground hover:bg-muted disabled:opacity-60"
              >
                {loadingMore ? T.answers.loadingMore : T.answers.loadMore}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
