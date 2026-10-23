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

const PAGE_SIZE = 10;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function KnowledgeBaseListClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
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
      setError(e instanceof KnowledgeError ? e.message : 'Could not load knowledge bases.');
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
      toast.success(`Deleted “${deleteTarget.name}”`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof KnowledgeError ? e.message : 'Could not delete the knowledge base.');
    } finally {
      setDeleting(false);
    }
  };

  const stats = [
    { label: 'Knowledge Bases', value: bases.length, icon: 'CircleStackIcon' },
    { label: 'Documents', value: bases.reduce((n, b) => n + b.documentCount, 0), icon: 'DocumentTextIcon' },
    { label: 'Not Chunked', value: bases.reduce((n, b) => n + b.notChunkedCount, 0), icon: 'ScissorsIcon' },
    { label: 'Searchable Chunks', value: bases.reduce((n, b) => n + b.chunkCount, 0), icon: 'Squares2X2Icon' },
  ];

  const headers = ['Name', 'ID', 'Embedding', 'Documents', 'Chunks', 'Owner', 'Created', 'Updated', 'Actions'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[280px]">
          <h1 className="text-[22px] font-700 text-foreground">Knowledge Base</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Collections of documents the AI assistant can search to answer patient questions. Open one to manage its documents.
          </p>
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
              placeholder="Search knowledge bases"
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
            Refresh
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap"
          >
            <Icon name="PlusIcon" size={16} variant="outline" />
            New Knowledge Base
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
                  <th key={`kbl-th-${h}`} className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider whitespace-nowrap">
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
                    <EmptyState icon="ExclamationTriangleIcon" title="Could not load knowledge bases" description={error} action={{ label: 'Retry', onClick: () => { setLoading(true); load(); } }} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length}>
                    {search ? (
                      <EmptyState icon="MagnifyingGlassIcon" title="No matches" description={`No knowledge base matches “${search}”.`} />
                    ) : (
                      <EmptyState
                        icon="CircleStackIcon"
                        title="No knowledge bases yet"
                        description="Create one, then upload documents into it."
                        action={{ label: 'New Knowledge Base', onClick: () => { setEditing(null); setFormOpen(true); } }}
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
                        {!b.active && <Badge variant="inactive" label="Off" size="sm" />}
                      </div>
                      {b.description && <p className="text-[11px] text-muted-foreground truncate">{b.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-border text-muted-foreground whitespace-nowrap">{b.slug}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                      {b.embeddingModel ?? <span title="Added when vector search is switched on">Keyword only</span>}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-500 text-foreground tabular-nums">
                      {b.documentCount}
                      {b.notChunkedCount > 0 && (
                        <span className="ml-1.5 text-[11px] font-400 text-warning" title="Uploaded but not chunked yet">
                          ({b.notChunkedCount} not chunked)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-foreground tabular-nums">{b.chunkCount}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{b.ownerUsername ?? '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(b.updatedAt)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(b);
                            setFormOpen(true);
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-100"
                        >
                          <Icon name="PencilSquareIcon" size={13} variant="outline" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(b)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-500 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors duration-100"
                        >
                          <Icon name="TrashIcon" size={13} variant="outline" />
                          Delete
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
          <span>{filtered.length} knowledge base{filtered.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(current - 1)}
              disabled={current <= 1}
              className="px-3 py-1.5 border border-border rounded-lg bg-card hover:bg-muted transition-colors duration-150 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="tabular-nums">{current} / {pageCount}</span>
            <button
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount}
              className="px-3 py-1.5 border border-border rounded-lg bg-card hover:bg-muted transition-colors duration-150 disabled:opacity-50"
            >
              Next
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
              <h3 className="text-[15px] font-600 text-foreground">Delete knowledge base?</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              “{deleteTarget.name}”
              {deleteTarget.documentCount > 0
                ? ` and its ${deleteTarget.documentCount} document${deleteTarget.documentCount === 1 ? '' : 's'} (files and chunks) will be permanently deleted.`
                : ' will be deleted.'}{' '}
              To keep it but stop the AI from using it, turn off “Use in AI” in Edit instead.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="px-4 py-2 bg-danger text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 active:scale-95 disabled:opacity-60">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
