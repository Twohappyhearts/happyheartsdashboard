'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { KnowledgeError, deleteKnowledgeBase, listKnowledgeBases, type KnowledgeBase } from '@/lib/knowledge';
import KnowledgeBaseFormModal from './KnowledgeBaseFormModal';
import { useStaffT } from '@/lib/i18n/staff/context';

const PAGE_SIZE = 10;

function fmtDate(iso: string, locale: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function KnowledgeBaseListClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { t, locale } = useStaffT();
  const T = t.kb.list;
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setBases(await listKnowledgeBases(supabase));
      setError(null);
    } catch (e) {
      setError(e instanceof KnowledgeError ? e.message : T.loadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bases;
    return bases.filter((b) => b.name.toLowerCase().includes(q) || b.slug.includes(q) || b.description.toLowerCase().includes(q));
  }, [bases, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteKnowledgeBase(deleteTarget.id);
      toast.success(T.deleted(deleteTarget.name));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof KnowledgeError ? e.message : T.deleteFailed);
    } finally {
      setDeleting(false);
    }
  };

  const stats = [
    { label: T.stats.bases, value: bases.length, icon: 'CircleStackIcon' },
    { label: T.stats.documents, value: bases.reduce((n, b) => n + b.documentCount, 0), icon: 'DocumentTextIcon' },
    { label: T.stats.notChunked, value: bases.reduce((n, b) => n + b.notChunkedCount, 0), icon: 'ScissorsIcon' },
    { label: T.stats.chunks, value: bases.reduce((n, b) => n + b.chunkCount, 0), icon: 'Squares2X2Icon' },
  ];

  const C = T.columns;
  const headers = [C.name, C.id, C.embedding, C.documents, C.chunks, C.owner, C.created, C.updated, C.actions];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[280px]">
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={T.search}
              className="w-[220px] pl-8 pr-3 py-2.5 border border-border rounded-lg text-[13px] bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => {
              setRefreshing(true);
              load();
            }}
            className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg text-[13px] font-500 text-foreground bg-card hover:bg-muted transition-colors duration-150 whitespace-nowrap"
          >
            <Icon name="ArrowPathIcon" size={16} variant="outline" className={refreshing ? 'animate-spin' : ''} />
            {T.refresh}
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap"
          >
            <Icon name="PlusIcon" size={16} variant="outline" />
            {T.new}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={`kbl-stat-${s.label}`} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Icon name={s.icon as Parameters<typeof Icon>[0]['name']} size={18} variant="outline" className="text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider">{s.label}</p>
              {loading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-[24px] font-700 tabular-nums text-foreground leading-tight">{s.value}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {headers.map((h) => (
                  <th
                    key={`kbl-th-${h}`}
                    className={`text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider whitespace-nowrap ${h === C.actions ? 'sticky-actions' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`kbl-skel-${i}`} className="border-b border-border last:border-0">
                    <td colSpan={headers.length} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={headers.length}>
                    <EmptyState icon="ExclamationTriangleIcon" title={T.loadFailedTitle} description={error} action={{ label: T.retry, onClick: () => { setLoading(true); load(); } }} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length}>
                    {search ? (
                      <EmptyState icon="MagnifyingGlassIcon" title={T.noMatches} description={T.noMatchesBody(search)} />
                    ) : (
                      <EmptyState
                        icon="CircleStackIcon"
                        title={T.emptyTitle}
                        description={T.emptyBody}
                        action={{ label: T.new, onClick: () => { setEditing(null); setFormOpen(true); } }}
                      />
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/knowledge-base/${b.id}`)}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors duration-100 cursor-pointer"
                  >
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/knowledge-base/${b.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[13px] font-600 text-primary hover:underline truncate"
                        >
                          {b.name}
                        </Link>
                        {!b.active && <Badge variant="inactive" label={T.off} size="sm" />}
                      </div>
                      {b.description && <p className="text-[11px] text-muted-foreground truncate">{b.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-border text-muted-foreground whitespace-nowrap">{b.slug}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                      {b.embeddingModel ?? <span title={T.keywordOnlyHint}>{T.keywordOnly}</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-500 text-foreground tabular-nums">
                      {b.documentCount}
                      {b.notChunkedCount > 0 && (
                        <span className="ml-1.5 text-[11px] font-400 text-warning" title={T.notChunkedHint}>
                          {T.notChunked(b.notChunkedCount)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground tabular-nums">{b.chunkCount}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{b.ownerUsername ?? '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(b.createdAt, locale)}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(b.updatedAt, locale)}</td>
                    <td className="sticky-actions px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(b);
                            setFormOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-100"
                        >
                          <Icon name="PencilSquareIcon" size={13} variant="outline" />
                          {T.edit}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(b)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-500 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors duration-100"
                        >
                          <Icon name="TrashIcon" size={13} variant="outline" />
                          {T.delete}
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

      {/* Pagination */}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>{T.count(filtered.length)}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(current - 1)}
              disabled={current <= 1}
              className="px-3 py-1.5 border border-border rounded-lg bg-card hover:bg-muted transition-colors duration-150 disabled:opacity-50"
            >
              {T.previous}
            </button>
            <span className="tabular-nums">{current} / {pageCount}</span>
            <button
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount}
              className="px-3 py-1.5 border border-border rounded-lg bg-card hover:bg-muted transition-colors duration-150 disabled:opacity-50"
            >
              {T.next}
            </button>
          </div>
        </div>
      )}

      <KnowledgeBaseFormModal
        open={formOpen}
        knowledgeBase={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => {
          setFormOpen(false);
          if (editing) load();
          else router.push(`/knowledge-base/${id}`);
        }}
      />

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">{T.deleteTitle}</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">{T.deleteBody(deleteTarget.name, deleteTarget.documentCount)}</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
                {T.cancel}
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95 disabled:opacity-60">
                {deleting ? T.deleting : T.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
