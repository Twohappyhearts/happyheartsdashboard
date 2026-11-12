'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Toggle from '@/components/ui/Toggle';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { createClient } from '@/lib/supabase/client';
import {
  RESOURCE_CATEGORIES,
  ResourceError,
  createResource,
  deleteResource,
  isStaleRun,
  latestRuns,
  listResources,
  setResourceActive,
  updateResource,
  type CommunityResource,
  type ResourceCategory,
  type ResourceInput,
  type ResourceRun,
  type ResourceRunKind,
} from '@/lib/community-resources';
import { useStaffT } from '@/lib/i18n/staff/context';
import { translateServerMessage } from '@/lib/i18n/staff/server-messages';
import ResourceForm from './ResourceForm';
import ResourceAiBadge from './ResourceAiBadge';
import ResourceArticlePanel from './ResourceArticlePanel';

const POLL_MS = 3000;

type Runs = Record<ResourceRunKind, ResourceRun | null>;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** The Content page's Community Resources tab: the directory and its AI knowledge article. */
export default function ResourceDirectory({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { t, lang, locale } = useStaffT();
  const L = t.resources.list;
  const [resources, setResources] = useState<CommunityResource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ResourceCategory | 'all'>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityResource | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CommunityResource | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [list, latest] = await Promise.all([listResources(supabase), latestRuns(supabase)]);
      setResources(list);
      setRuns(latest);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ResourceError ? e.message : L.loadFailed);
    }
  }, [supabase, L.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (resources) onCountChange?.(resources.length);
  }, [resources, onCountChange]);

  // While a run is going, poll its progress and the AI status of the list.
  const running = !!runs && (['fetch', 'publish'] as const).some((k) => runs[k]?.status === 'running' && !isStaleRun(runs[k]!));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  // Toast when a run this page saw running (or started) finishes.
  const watched = useRef(new Set<string>());
  useEffect(() => {
    if (!runs) return;
    const A = t.resources.ai;
    for (const kind of ['fetch', 'publish'] as const) {
      const r = runs[kind];
      if (!r) continue;
      if (r.status === 'running') {
        watched.current.add(r.id);
        continue;
      }
      if (!watched.current.delete(r.id)) continue;
      if (kind === 'fetch') {
        if (r.status === 'done') toast.success(A.updateDone(r.okCount, r.failedCount));
        else toast.error(A.runFailed(translateServerMessage(r.error, lang)));
      } else if (r.status === 'done') {
        toast.success(r.result.unchanged ? A.publishUnchanged : A.publishDone(Number(r.result.chunkCount ?? 0)));
      } else {
        toast.error(A.publishFailed(translateServerMessage(r.error, lang)));
      }
    }
  }, [runs, t, lang]);

  const onStarted = useCallback(
    (runId: string | null) => {
      if (runId) watched.current.add(runId);
      void load();
    },
    [load],
  );

  const items = resources ?? [];
  const q = search.trim().toLowerCase();
  const filtered = items.filter((r) => (category === 'all' || r.category === category) && (!q || r.name.toLowerCase().includes(q)));
  const countBy = (c: ResourceCategory) => items.filter((r) => r.category === c).length;

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setFormDirty(false);
  }, []);

  const openNew = () => {
    setEditing(null);
    setPanelOpen(true);
  };
  const openEdit = (r: CommunityResource) => {
    setEditing(r);
    setPanelOpen(true);
  };

  const replace = (saved: CommunityResource) =>
    setResources((prev) => prev && prev.map((r) => (r.id === saved.id ? saved : r)));

  /** Throws on failure so the form keeps the input and shows the error. */
  const handleSave = async (input: ResourceInput) => {
    if (editing) {
      replace(await updateResource(supabase, editing.id, input));
      toast.success(L.updated);
    } else {
      const saved = await createResource(supabase, input);
      setResources((prev) => [...(prev ?? []), saved].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(L.created(saved.name));
    }
    closePanel();
  };

  const toggleActive = async (r: CommunityResource) => {
    const next = !r.active;
    replace({ ...r, active: next });
    setToggling((x) => ({ ...x, [r.id]: true }));
    try {
      replace(await setResourceActive(supabase, r.id, next));
      toast.success(next ? L.nowActive(r.name) : L.nowInactive(r.name));
    } catch (e) {
      replace(r);
      toast.error(e instanceof ResourceError ? e.message : L.changeFailed);
    } finally {
      setToggling(({ [r.id]: _done, ...rest }) => rest);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteResource(supabase, deleteTarget.id);
      setResources((prev) => prev && prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(L.deleted);
    } catch (e) {
      toast.error(e instanceof ResourceError ? e.message : L.changeFailed);
    } finally {
      setDeleting(false);
    }
  };

  const verified = (d: string | null) => {
    if (!d) return '—';
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const th = 'text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider';
  const colCount = 9;
  const loading = resources === null && !loadError;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-muted-foreground max-w-3xl">{L.intro}</p>
        <button
          onClick={openNew}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm disabled:opacity-60"
        >
          <Icon name="PlusIcon" size={16} variant="outline" />
          {L.add}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={L.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-72"
          />
        </div>
        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ResourceCategory | 'all')}
            className="appearance-none pl-3 pr-9 py-2 border border-border rounded-lg text-[13px] bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            <option value="all">
              {L.allCategories} ({items.length})
            </option>
            {RESOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.resources.categories[c]} ({countBy(c)})
              </option>
            ))}
          </select>
          <Icon name="ChevronDownIcon" size={16} variant="outline" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>
        <span className="text-[12px] text-muted-foreground ml-auto">{L.countOf(filtered.length, items.length)}</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-h-[70vh] overflow-y-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted">
                <th className={th}>{L.columns.name}</th>
                <th className={th}>{L.columns.category}</th>
                <th className={th}>{L.columns.area}</th>
                <th className={th}>{L.columns.phone}</th>
                <th className={th}>{L.columns.website}</th>
                <th className={th}>{L.columns.active}</th>
                <th className={th}>{L.columns.verified}</th>
                <th className={th}>{L.columns.ai}</th>
                <th className={`${th} w-20 sticky-actions [--sticky-bg:var(--muted)]`}>{L.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={`sk-${i}`} className="border-b border-border last:border-0 animate-pulse">
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : loadError ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <p className="text-[13px] text-danger mb-3">{loadError}</p>
                    <button onClick={() => void load()} className="text-[13px] font-600 text-primary hover:underline">
                      {t.common.tryAgain}
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount}>
                    <EmptyState
                      icon="BuildingStorefrontIcon"
                      title={L.emptyTitle}
                      description={items.length === 0 ? L.emptyNone : L.emptyFiltered}
                      action={{ label: L.add, onClick: openNew }}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors duration-100 ${r.active ? '' : 'opacity-70'}`}>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-600 text-foreground max-w-[240px] truncate" title={r.name}>
                        {r.name}
                      </p>
                      {r.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[240px] truncate" title={r.description}>
                          {r.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-500 px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                        {t.resources.categories[r.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-foreground">
                      <p className="max-w-[160px] truncate" title={r.areaServed}>
                        {r.areaServed || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-foreground">
                      <p className="max-w-[160px] truncate" title={r.phone}>
                        {r.phone || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {r.website ? (
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={L.openWebsite}
                          className="inline-flex items-center gap-1 text-primary hover:underline max-w-[180px]"
                        >
                          <span className="truncate">{hostOf(r.website)}</span>
                          <Icon name="ArrowTopRightOnSquareIcon" size={12} variant="outline" className="shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle checked={r.active} disabled={!!toggling[r.id]} onChange={() => void toggleActive(r)} />
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">{verified(r.lastVerifiedOn)}</td>
                    <td className="px-4 py-3">
                      <ResourceAiBadge resource={r} />
                    </td>
                    <td className="sticky-actions px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          title={L.edit}
                          aria-label={L.edit}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100"
                        >
                          <Icon name="PencilIcon" size={14} variant="outline" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          title={L.delete}
                          aria-label={L.delete}
                          className="p-1.5 rounded-md hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors duration-100"
                        >
                          <Icon name="TrashIcon" size={14} variant="outline" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ResourceArticlePanel resources={resources} runs={runs} onStarted={onStarted} />

      <SlideOver
        open={panelOpen}
        onClose={closePanel}
        dirty={formDirty}
        title={editing ? L.editTitle : L.newTitle}
        subtitle={editing ? L.editing(editing.name) : L.newSubtitle}
        width="lg"
      >
        {panelOpen && <ResourceForm key={editing?.id ?? 'new'} item={editing} onSave={handleSave} onDirtyChange={setFormDirty} />}
      </SlideOver>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={L.deleteTitle}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 disabled:opacity-60"
            >
              {deleting ? t.common.deleting : L.deleteButton}
            </button>
          </>
        }
      >
        <p className="text-[13px] text-foreground mb-2">{deleteTarget ? L.deleteBody(deleteTarget.name) : ''}</p>
        <p className="text-[12px] text-muted-foreground">{L.deleteHint}</p>
      </Modal>
    </div>
  );
}
