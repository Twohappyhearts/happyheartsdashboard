'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import {
  ResourceError,
  isStaleRun,
  needsWebsiteCheck,
  previewArticle,
  publishArticle,
  startWebsiteUpdate,
  type ArticleEntryProblem,
  type ArticlePreview,
  type CommunityResource,
  type ResourceRun,
  type ResourceRunKind,
} from '@/lib/community-resources';
import { useStaffT } from '@/lib/i18n/staff/context';
import { translateServerMessage } from '@/lib/i18n/staff/server-messages';

interface ResourceArticlePanelProps {
  resources: CommunityResource[] | null;
  runs: Record<ResourceRunKind, ResourceRun | null> | null;
  /** Reload the runs (and the list) after starting one; null when nothing needed doing. */
  onStarted: (runId: string | null) => void;
}

const SHOWN_PROBLEMS = 8;

function ProblemList({ title, hint, items, tone }: { title: string; hint: string; items: ArticleEntryProblem[]; tone: string }) {
  const { t, lang } = useStaffT();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOWN_PROBLEMS);
  return (
    <div className="rounded-lg border border-border p-3">
      <p className={`text-[13px] font-600 ${tone}`}>{title}</p>
      <p className="text-[11px] text-muted-foreground mb-2">{hint}</p>
      <ul className="space-y-1">
        {shown.map((p) => (
          <li key={p.id} className="text-[12px] text-foreground">
            <span className="font-600">{p.name}</span>
            <span className="text-muted-foreground"> · {t.resources.categories[p.category]}</span>
            {p.error && <span className="text-muted-foreground"> — {translateServerMessage(p.error, lang)}</span>}
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="mt-1 text-[12px] font-600 text-primary hover:underline">
          {t.resources.ai.showMore(items.length - shown.length)}
        </button>
      )}
    </div>
  );
}

export default function ResourceArticlePanel({ resources, runs, onStarted }: ResourceArticlePanelProps) {
  const { t, lang, locale } = useStaffT();
  const A = t.resources.ai;
  const [starting, setStarting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ArticlePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const fetchRun = runs?.fetch ?? null;
  const publishRun = runs?.publish ?? null;
  const live = (r: ResourceRun | null) => !!r && r.status === 'running' && !isStaleRun(r);
  const busy = live(fetchRun) || live(publishRun) || starting || publishing;
  const todo = (resources ?? []).filter((r) => needsWebsiteCheck(r)).length;
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const fmt = (n: number) => n.toLocaleString(locale);
  const message = (e: unknown, fallback: string) => (e instanceof ResourceError ? e.message : fallback);

  const startUpdate = async () => {
    setStarting(true);
    try {
      const { runId } = await startWebsiteUpdate();
      if (!runId) toast.success(A.step1Todo(0));
      onStarted(runId);
    } catch (e) {
      toast.error(message(e, t.common.somethingWrong));
    } finally {
      setStarting(false);
    }
  };

  const openPreview = async () => {
    setPreviewOpen(true);
    setPreview(null);
    setPreviewError(null);
    try {
      setPreview(await previewArticle());
    } catch (e) {
      setPreviewError(message(e, t.common.somethingWrong));
    }
  };

  const publish = async () => {
    if (!preview) return;
    setPublishing(true);
    setPreviewError(null);
    try {
      const { runId } = await publishArticle(preview.hash);
      setPreviewOpen(false);
      onStarted(runId);
    } catch (e) {
      setPreviewError(message(e, t.common.somethingWrong));
    } finally {
      setPublishing(false);
    }
  };

  const fetchSummary = (run: ResourceRun) => {
    const models = Object.keys(run.usage.models);
    return (
      <div className="text-[12px] text-muted-foreground space-y-0.5">
        <p>
          {A.lastUpdate(when(run.finishedAt ?? run.startedAt))} — {A.runSummary(run.processed, run.okCount, run.failedCount)}
        </p>
        {run.usage.modelCalls > 0 && (
          <p>
            {A.tokens(fmt(run.usage.inputTokens), fmt(run.usage.cachedInputTokens), fmt(run.usage.outputTokens), fmt(run.usage.reasoningTokens))}{' '}
            {models.length > 0 && A.models(models.join(', '))} {A.toolCalls(run.usage.toolCalls)}
          </p>
        )}
        {run.status === 'failed' && run.error && <p className="text-danger">{A.runFailed(translateServerMessage(run.error, lang))}</p>}
      </div>
    );
  };

  const publishedLine = () => {
    if (!publishRun) return <p className="text-[12px] text-muted-foreground">{A.notPublished}</p>;
    if (publishRun.status === 'failed') {
      return <p className="text-[12px] text-danger">{A.publishFailed(translateServerMessage(publishRun.error, lang))}</p>;
    }
    if (publishRun.status === 'done') {
      return (
        <p className="text-[12px] text-muted-foreground">
          {A.published(when(publishRun.finishedAt), Number(publishRun.result.chunkCount ?? 0))}
        </p>
      );
    }
    return null;
  };

  const progress = (run: ResourceRun) => (run.total ? Math.round((run.processed / run.total) * 100) : 0);

  return (
    <div className="bg-card rounded-xl border border-border shadow-card p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-700 text-foreground flex items-center gap-2">
          <Icon name="SparklesIcon" size={16} variant="outline" className="text-primary" />
          {A.title}
        </h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">{A.intro}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Step 1 */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-[13px] font-600 text-foreground">{A.step1}</h3>
          <p className="text-[12px] text-foreground">{A.step1Todo(todo)}</p>
          {fetchRun && live(fetchRun) && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress(fetchRun)}%` }} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                {A.checking(fetchRun.processed, fetchRun.total)} · {A.counts(fetchRun.okCount, fetchRun.failedCount)}
              </p>
            </div>
          )}
          {fetchRun && isStaleRun(fetchRun) && <p className="text-[12px] text-warning">{A.runStale}</p>}
          {fetchRun && fetchRun.status !== 'running' && fetchSummary(fetchRun)}
          <button
            type="button"
            onClick={() => void startUpdate()}
            disabled={busy || resources === null}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[13px] font-600 text-foreground hover:bg-muted disabled:opacity-60"
          >
            <Icon name={busy && live(fetchRun) ? 'ArrowPathIcon' : 'GlobeAltIcon'} size={15} variant="outline" className={busy && live(fetchRun) ? 'animate-spin' : ''} />
            {starting ? A.starting : A.update}
          </button>
        </div>

        {/* Step 2 */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-[13px] font-600 text-foreground">{A.step2}</h3>
          {publishRun && live(publishRun) ? (
            <p className="text-[12px] text-muted-foreground flex items-center gap-2">
              <Icon name="ArrowPathIcon" size={13} variant="outline" className="animate-spin" />
              {A.publishing}
            </p>
          ) : (
            publishedLine()
          )}
          {publishRun && isStaleRun(publishRun) && <p className="text-[12px] text-warning">{A.runStale}</p>}
          <button
            type="button"
            onClick={() => void openPreview()}
            disabled={busy || resources === null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-60"
          >
            <Icon name="DocumentMagnifyingGlassIcon" size={15} variant="outline" />
            {A.preview}
          </button>
        </div>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => !publishing && setPreviewOpen(false)}
        title={A.previewTitle}
        size="xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              disabled={publishing}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={!preview || publishing || busy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-60"
            >
              {publishing && <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />}
              {A.publish}
            </button>
          </>
        }
      >
        {previewError && <div className="mb-3 p-3 rounded-lg border border-danger/30 bg-danger/5 text-[13px] text-danger">{previewError}</div>}
        {!preview && !previewError && <p className="text-[13px] text-muted-foreground">{A.loadingPreview}</p>}
        {preview && (
          <div className="space-y-4">
            <p className="text-[13px] text-foreground">{A.previewIntro(preview.entryCount, preview.withSummary)}</p>
            {preview.published?.sameAsPreview && <p className="text-[12px] text-success">{A.sameAsPublished}</p>}
            <ProblemList title={A.failedTitle(preview.failed.length)} hint={A.failedHint} items={preview.failed} tone="text-danger" />
            <ProblemList title={A.pendingTitle(preview.pending.length)} hint={A.pendingHint} items={preview.pending} tone="text-warning" />
            <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground bg-muted/40 border border-border rounded-lg p-4 max-h-[50vh] overflow-y-auto scrollbar-thin font-mono">
              {preview.markdown}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
