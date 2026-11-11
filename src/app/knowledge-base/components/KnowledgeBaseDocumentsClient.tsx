'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import Toggle from '@/components/ui/Toggle';
import SlideOver from '@/components/ui/SlideOver';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_MB,
  KnowledgeError,
  deleteDocument,
  fileUrl,
  fmtBytes,
  fmtRelative,
  getKnowledgeBase,
  listChunks,
  listDocuments,
  refreshParsing,
  updateDocument,
  uploadDocument,
  type KnowledgeBase,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type KnowledgeStatus,
} from '@/lib/knowledge';
import ChunkModal from './ChunkModal';
import KnowledgeBaseFormModal from './KnowledgeBaseFormModal';
import DocumentEditModal from './DocumentEditModal';
import ChunkContent from './ChunkContent';
import SearchTestPanel from './SearchTestPanel';

const PAGE_SIZE = 10;

interface UploadItem {
  key: string;
  name: string;
  state: 'uploading' | 'done' | 'failed';
  message?: string;
}

const STATUS: Record<KnowledgeStatus, { label: string; dot: string }> = {
  uploaded: { label: 'Not chunked', dot: 'bg-[#A0AEC0]' },
  parsed: { label: 'Not chunked', dot: 'bg-[#A0AEC0]' },
  parsing: { label: 'Chunking…', dot: 'bg-warning animate-pulse' },
  processing: { label: 'Chunking…', dot: 'bg-warning animate-pulse' },
  ready: { label: 'Ready', dot: 'bg-success' },
  failed: { label: 'Failed', dot: 'bg-danger' },
};

type StatusFilter = 'all' | 'not' | 'busy' | 'ready' | 'failed';
const STATUS_FILTERS: { value: StatusFilter; label: string; match: (d: KnowledgeDocument) => boolean }[] = [
  { value: 'all', label: 'All statuses', match: () => true },
  { value: 'not', label: 'Not chunked', match: (d) => d.status === 'uploaded' || d.status === 'parsed' },
  { value: 'busy', label: 'Chunking', match: (d) => d.status === 'parsing' || d.status === 'processing' },
  { value: 'ready', label: 'Ready', match: (d) => d.status === 'ready' },
  { value: 'failed', label: 'Failed / last attempt failed', match: (d) => d.status === 'failed' || !!d.error },
];

/** A Chunk job is running: the document is locked. */
const busy = (d: KnowledgeDocument) => d.status === 'parsing' || d.status === 'processing';

/** Second line under the status: job progress, or why the last attempt failed. */
function statusDetail(doc: KnowledgeDocument): { text: string; tone: 'muted' | 'danger' } | null {
  if (doc.status === 'parsing') {
    const p = doc.parseProgress;
    if (doc.parser !== 'mineru') return { text: 'Reading the file', tone: 'muted' };
    if (p?.state === 'importing') return { text: 'MinerU · importing result', tone: 'muted' };
    if (p?.totalPages) return { text: `Reading file (MinerU) · ${p.extractedPages ?? 0}/${p.totalPages} pages`, tone: 'muted' };
    return { text: `Reading file (MinerU) · ${p?.state === 'running' ? 'running' : 'queued'}`, tone: 'muted' };
  }
  if (doc.status === 'processing') {
    const j = doc.jobProgress;
    if (j?.phase === 'embedding' && j.total) return { text: `Embedding · ${j.done ?? 0}/${j.total}`, tone: 'muted' };
    return { text: 'Splitting into chunks', tone: 'muted' };
  }
  if (doc.error) return { text: doc.chunkGeneration ? 'Last attempt failed · previous chunks kept' : 'Last attempt failed', tone: 'danger' };
  return null;
}

function fileExt(doc: KnowledgeDocument) {
  return (doc.fileName.split('.').pop() ?? '').toLowerCase();
}

function typeLabel(doc: KnowledgeDocument) {
  const ext = fileExt(doc);
  return ext === 'md' ? 'markdown' : ext || 'file';
}

function FileIcon({ doc }: { doc: KnowledgeDocument }) {
  const ext = fileExt(doc);
  const color = ext === 'pdf' ? 'text-danger' : ext === 'docx' ? 'text-info' : 'text-accent';
  return <Icon name="DocumentTextIcon" size={18} variant="outline" className={`${color} shrink-0`} />;
}

/** "⋯" menu with less frequent actions. */
function RowMenu({ doc, onDelete, disabled }: { doc: KnowledgeDocument; onDelete: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="More actions"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none"
      >
        <Icon name="EllipsisHorizontalIcon" size={16} variant="outline" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-card border border-border rounded-lg shadow-modal py-1">
          <a
            href={fileUrl(doc.id)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-muted"
          >
            <Icon name="ArrowDownTrayIcon" size={14} variant="outline" />
            Download original
          </a>
          {doc.hasParsed && (
            <a
              href={fileUrl(doc.id, 'parsed')}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[12px] text-foreground hover:bg-muted"
            >
              <Icon name="DocumentTextIcon" size={14} variant="outline" />
              Download extracted text (Markdown)
            </a>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-danger hover:bg-danger/10"
          >
            <Icon name="TrashIcon" size={14} variant="outline" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

const actionBtn =
  'flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-100 disabled:opacity-40 whitespace-nowrap';

export default function KnowledgeBaseDocumentsClient({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [kbMissing, setKbMissing] = useState(false);
  const [editingKb, setEditingKb] = useState(false);
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // List controls
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs
  const [chunkTargets, setChunkTargets] = useState<KnowledgeDocument[] | null>(null);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<KnowledgeDocument[] | null>(null);
  const [showSearchText, setShowSearchText] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Chunk preview
  const [viewing, setViewing] = useState<KnowledgeDocument | null>(null);
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);


  const load = useCallback(async () => {
    try {
      const [base, list] = await Promise.all([
        getKnowledgeBase(supabase, knowledgeBaseId),
        listDocuments(supabase, knowledgeBaseId),
      ]);
      setKb(base);
      setKbMissing(!base);
      setDocs(list);
      // Drop documents that disappeared or are now locked by a running job.
      setSelected((sel) => new Set([...sel].filter((id) => list.some((d) => d.id === id && !busy(d)))));
      setError(null);
    } catch (e) {
      setError(e instanceof KnowledgeError ? e.message : 'Could not load documents.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, knowledgeBaseId]);

  useEffect(() => {
    load();
  }, [load]);

  // While MinerU is parsing (or another tab is working), check every 5 s.
  const parsingIds = docs.filter((d) => d.status === 'parsing' && d.parser === 'mineru').map((d) => d.id).join(',');
  const anyBusy = docs.some(busy);
  useEffect(() => {
    if (!anyBusy) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        if (parsingIds) await refreshParsing(parsingIds.split(','));
      } catch {
        /* the next tick retries */
      }
      if (!stopped) load();
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [anyBusy, parsingIds, load]);

  // ---- Upload -------------------------------------------------------------
  const uploadFiles = async (files: File[]) => {
    const accepted = files.filter((f) => {
      const ok = ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));
      if (!ok) toast.error(`${f.name}: only PDF, Word, PowerPoint, .txt and .md files are supported`);
      else if (f.size > MAX_UPLOAD_MB * 1024 * 1024) toast.error(`${f.name}: larger than ${MAX_UPLOAD_MB} MB`);
      return ok && f.size <= MAX_UPLOAD_MB * 1024 * 1024;
    });
    // Upload stores the file and starts parsing; chunking is a separate step.
    let ok = 0;
    for (const file of accepted) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      setUploads((u) => [{ key, name: file.name, state: 'uploading' }, ...u]);
      try {
        const res = await uploadDocument(file, knowledgeBaseId);
        ok += 1;
        void res;
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: 'done', message: 'Uploaded — not chunked yet' } : x)));
      } catch (e) {
        const message = e instanceof KnowledgeError ? e.message : 'Upload failed';
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, state: 'failed', message } : x)));
        toast.error(`${file.name}: ${message}`);
      }
      await load();
    }
    if (ok) toast.success(`Uploaded ${ok} file${ok === 1 ? '' : 's'} — select and click Chunk to process`);
  };

  // ---- Row actions --------------------------------------------------------
  const toggleActive = async (doc: KnowledgeDocument) => {
    const next = !doc.active;
    setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, active: next } : x)));
    try {
      await updateDocument(doc.id, { isActive: next });
    } catch (e) {
      setDocs((d) => d.map((x) => (x.id === doc.id ? { ...x, active: doc.active } : x)));
      toast.error(e instanceof KnowledgeError ? e.message : 'Could not update the document.');
    }
  };

  const openChunks = async (doc: KnowledgeDocument) => {
    setViewing(doc);
    setChunks([]);
    if (!doc.chunkGeneration) return;
    setChunksLoading(true);
    try {
      setChunks(await listChunks(supabase, doc.id, doc.chunkGeneration));
    } catch (e) {
      toast.error(e instanceof KnowledgeError ? e.message : 'Could not load chunks.');
    } finally {
      setChunksLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargets) return;
    setDeleting(true);
    let failed = 0;
    for (const d of deleteTargets) {
      try {
        await deleteDocument(d.id);
      } catch {
        failed += 1;
      }
    }
    const done = deleteTargets.length - failed;
    if (done) toast.success(`Deleted ${done} document${done === 1 ? '' : 's'}`);
    if (failed) toast.error(`${failed} document${failed === 1 ? '' : 's'} could not be deleted`);
    if (viewing && deleteTargets.some((d) => d.id === viewing.id)) setViewing(null);
    setDeleteTargets(null);
    setDeleting(false);
    setSelected(new Set());
    await load();
  };

  // ---- Derived ------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(
      (d) =>
        STATUS_FILTERS.find((f) => f.value === statusFilter)!.match(d) &&
        (!q || d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)),
    );
  }, [docs, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selectableRows = rows.filter((d) => !busy(d));
  const pageAllSelected = selectableRows.length > 0 && selectableRows.every((d) => selected.has(d.id));
  const selectedDocs = docs.filter((d) => selected.has(d.id));
  const actionable = selectedDocs.filter((d) => !busy(d));

  const toggleSelected = (id: string) =>
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((sel) => {
      const next = new Set(sel);
      if (pageAllSelected) selectableRows.forEach((d) => next.delete(d.id));
      else selectableRows.forEach((d) => next.add(d.id));
      return next;
    });

  if (kbMissing && !loading) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-card">
        <EmptyState
          icon="CircleStackIcon"
          title="Knowledge base not found"
          description="It may have been deleted."
          action={{ label: 'Back to knowledge bases', onClick: () => window.location.assign('/knowledge-base') }}
        />
      </div>
    );
  }

  const headers = ['Document', 'Status', 'Enabled', 'Chunks', 'Chunk settings', 'Updated', 'Actions'];

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[280px]">
          <h1 className="text-[22px] font-700 text-foreground">Documents</h1>
          <div className="text-[13px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            {kb ? (
              <>
                <span>{kb.name}</span>
                <span className="font-mono text-[12px]">({kb.slug})</span>
                {!kb.active && <Badge variant="inactive" label="Off — not used by AI" size="sm" />}
              </>
            ) : (
              <Skeleton className="h-4 w-40" />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/knowledge-base"
            className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg text-[13px] font-500 text-foreground bg-card hover:bg-muted transition-colors duration-150 whitespace-nowrap"
          >
            <Icon name="ArrowLeftIcon" size={16} variant="outline" />
            Back to Knowledge Bases
          </Link>
          <button
            onClick={() => setEditingKb(true)}
            disabled={!kb}
            title="Knowledge base settings"
            className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg text-[13px] font-500 text-foreground bg-card hover:bg-muted transition-colors duration-150 disabled:opacity-50 whitespace-nowrap"
          >
            <Icon name="Cog6ToothIcon" size={16} variant="outline" />
            Settings
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm whitespace-nowrap"
          >
            <Icon name="ArrowUpTrayIcon" size={16} variant="outline" />
            Upload Documents
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              uploadFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Upload progress */}
      {uploads.some((u) => u.state === 'uploading' || u.state === 'failed') && (
        <div className="bg-card rounded-xl border border-border shadow-card divide-y divide-border">
          {uploads
            .filter((u) => u.state !== 'done')
            .slice(0, 6)
            .map((u) => (
              <div key={u.key} className="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                {u.state === 'uploading' ? (
                  <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin text-muted-foreground" />
                ) : (
                  <Icon name="ExclamationCircleIcon" size={14} variant="solid" className="text-danger" />
                )}
                <span className="font-500 text-foreground truncate flex-1">{u.name}</span>
                <span className={u.state === 'failed' ? 'text-danger' : 'text-muted-foreground'}>{u.state === 'uploading' ? 'Uploading…' : u.message}</span>
                {u.state === 'failed' && (
                  <button onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
                    <Icon name="XMarkIcon" size={14} variant="outline" />
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Document list (also a drop target) */}
      <div
        className={`relative bg-card rounded-xl border shadow-card ${dragging ? 'border-primary' : 'border-border'}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          uploadFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {dragging && (
          <div className="absolute inset-0 z-20 rounded-xl bg-primary/5 border-2 border-dashed border-primary flex flex-col items-center justify-center pointer-events-none">
            <Icon name="DocumentArrowUpIcon" size={28} variant="outline" className="text-primary mb-1" />
            <p className="text-[13px] font-600 text-foreground">Drop to upload into {kb?.name ?? 'this knowledge base'}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-[15px] font-700 text-foreground">Document list</h2>
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
                placeholder="Search documents"
                className="w-[220px] pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="px-3 py-2 border border-border rounded-lg text-[13px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={`sf-${f.value}`} value={f.value}>
                  {f.label}
                  {f.value !== 'all' ? ` (${docs.filter(f.match).length})` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setRefreshing(true);
                load();
              }}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
            >
              <Icon name="ArrowPathIcon" size={15} variant="outline" className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="pl-5 pr-1 py-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={pageAllSelected}
                    disabled={selectableRows.length === 0}
                    onChange={togglePage}
                    className="accent-[var(--primary)] w-4 h-4"
                  />
                </th>
                {headers.map((h) => (
                  <th key={`kd-th-${h}`} className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`kd-skel-${i}`} className="border-b border-border last:border-0">
                    <td colSpan={headers.length + 1} className="px-5 py-3"><Skeleton className="h-9 w-full" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={headers.length + 1}>
                    <EmptyState icon="ExclamationTriangleIcon" title="Could not load documents" description={error} action={{ label: 'Retry', onClick: () => { setLoading(true); load(); } }} />
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 1}>
                    <EmptyState
                      icon="DocumentArrowUpIcon"
                      title="No documents yet"
                      description="Upload patient-education PDFs or guides — or drag files onto this table."
                      action={{ label: 'Upload Documents', onClick: () => fileInput.current?.click() }}
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 1}>
                    <EmptyState icon="FunnelIcon" title="No matching documents" description="Try another search or status." />
                  </td>
                </tr>
              ) : (
                rows.map((doc) => {
                  const st = STATUS[doc.status];
                  const isSel = selected.has(doc.id);
                  const locked = busy(doc);
                  const detail = statusDetail(doc);
                  return (
                    <tr
                      key={doc.id}
                      className={`border-b border-border last:border-0 transition-colors duration-100 ${isSel ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
                    >
                      <td className="pl-5 pr-1 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${doc.title}`}
                          checked={isSel}
                          disabled={locked}
                          title={locked ? 'Being chunked — wait until it finishes' : undefined}
                          onChange={() => toggleSelected(doc.id)}
                          className="accent-[var(--primary)] w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3 max-w-[320px]">
                        <div className="flex items-start gap-2.5">
                          <FileIcon doc={doc} />
                          <div className="min-w-0">
                            <button onClick={() => openChunks(doc)} className="block text-left text-[13px] font-600 text-foreground truncate max-w-full hover:underline" title={doc.fileName}>
                              {doc.title}
                            </button>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {typeLabel(doc)} · {fmtBytes(doc.sizeBytes)}
                              {doc.pageCount ? ` · ${doc.pageCount} pages` : ''} · Local file
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground whitespace-nowrap" title={doc.error ?? undefined}>
                          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                        {detail && (
                          <p
                            className={`text-[10px] mt-0.5 max-w-[220px] truncate ${detail.tone === 'danger' ? 'text-danger' : 'text-muted-foreground'}`}
                            title={doc.error ?? detail.text}
                          >
                            {detail.text}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          title={
                            locked
                              ? 'Being chunked — wait until it finishes'
                              : doc.chunkGeneration
                                ? doc.active
                                  ? 'Used by the AI assistant'
                                  : 'Hidden from the AI assistant'
                                : 'Chunk the document first'
                          }
                        >
                          <Toggle checked={doc.active} onChange={() => toggleActive(doc)} disabled={locked || !doc.chunkGeneration} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-500 text-foreground tabular-nums">{doc.chunkGeneration ? doc.chunkCount : '—'}</td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                        {doc.chunkSettings ? (
                          <span
                            title={`${doc.chunkSettings.targetChars} characters per chunk, ${doc.chunkSettings.overlapChars} overlap, structure tolerance ×${doc.chunkSettings.toleranceFactor}`}
                          >
                            {doc.chunkSettings.targetChars} / {doc.chunkSettings.overlapChars} · ×{doc.chunkSettings.toleranceFactor}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                        {doc.uploaderUsername ?? '—'} · {fmtRelative(doc.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openChunks(doc)} className={actionBtn}>
                            <Icon name="EyeIcon" size={13} variant="outline" />
                            Preview
                          </button>
                          <button onClick={() => setEditingDoc(doc)} disabled={locked} className={actionBtn}>
                            <Icon name="PencilSquareIcon" size={13} variant="outline" />
                            Edit
                          </button>
                          <button
                            onClick={() => setChunkTargets([doc])}
                            disabled={locked}
                            title={locked ? 'Being chunked — wait until it finishes' : 'Chunk and embed'}
                            className={actionBtn}
                          >
                            <Icon name={locked ? 'ArrowPathIcon' : 'ScissorsIcon'} size={13} variant="outline" className={locked ? 'animate-spin' : ''} />
                            {locked ? 'Chunking…' : doc.chunkGeneration ? 'Re-chunk' : 'Chunk'}
                          </button>
                          <RowMenu doc={doc} onDelete={() => setDeleteTargets([doc])} disabled={locked} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && !error && docs.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-[12px] text-muted-foreground">
            <span>
              {filtered.length} document{filtered.length === 1 ? '' : 's'}
              {filtered.length !== docs.length ? ` (of ${docs.length})` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(current - 1)} disabled={current <= 1} className="px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors duration-150 disabled:opacity-50">
                Previous
              </button>
              <span className="tabular-nums">{current} / {pageCount}</span>
              <button onClick={() => setPage(current + 1)} disabled={current >= pageCount} className="px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors duration-150 disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hybrid search tester (collapsible) */}
      <SearchTestPanel knowledgeBaseId={knowledgeBaseId} />

      {/* Floating bulk-action bar: only while documents are selected */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 fade-in">
          <div className="flex items-center gap-1 bg-foreground text-white rounded-xl shadow-modal px-2 py-2 text-[13px]">
            <span className="flex items-center gap-2 px-3 py-1.5 font-600 whitespace-nowrap">
              <Icon name="CheckIcon" size={16} variant="outline" className="text-success" />
              {selected.size} selected
            </span>
            <span className="w-px h-5 bg-white/20" />
            <button
              onClick={() => setChunkTargets(actionable)}
              disabled={actionable.length === 0}
              title="Chunk and embed each selected document"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors duration-150 disabled:opacity-50 whitespace-nowrap"
            >
              <Icon name="ScissorsIcon" size={15} variant="outline" />
              Batch chunk
            </button>
            <button
              onClick={() => setDeleteTargets(actionable)}
              disabled={actionable.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#FF8A8A] hover:bg-white/10 transition-colors duration-150 whitespace-nowrap"
            >
              <Icon name="TrashIcon" size={15} variant="outline" />
              Delete
            </button>
            <span className="w-px h-5 bg-white/20" />
            <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors duration-150">
              <Icon name="XMarkIcon" size={16} variant="outline" />
            </button>
          </div>
        </div>
      )}

      {/* Chunk preview */}
      <SlideOver
        open={!!viewing}
        onClose={() => {
          setViewing(null);
          setChunks([]);
        }}
        title={viewing?.title ?? 'Chunks'}
        subtitle={
          viewing
            ? [
              viewing.fileName,
              viewing.chunkGeneration ? `${viewing.chunkCount} chunks` : null,
              viewing.pageCount ? `${viewing.pageCount} pages` : null,
              viewing.chunkSettings
                ? `${viewing.chunkSettings.targetChars} / ${viewing.chunkSettings.overlapChars} · ×${viewing.chunkSettings.toleranceFactor}`
                : null,
              viewing.embeddingModel ? `${viewing.embeddingModel}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
            : ''
        }
        width="xl"
      >
        {chunksLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={`ck-skel-${i}`} className="h-24 w-full" />)}</div>
        ) : viewing && !viewing.chunkGeneration ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-[13px] text-muted-foreground">
              {busy(viewing) ? 'This document is being chunked.' : 'This document hasn’t been chunked yet.'}
            </p>
            {viewing.error && <p className="text-[12px] text-danger">Last attempt failed: {viewing.error}</p>}
            {!busy(viewing) && (
              <button
                onClick={() => setChunkTargets([viewing])}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95"
              >
                {viewing.error ? 'Try again' : 'Chunk now'}
              </button>
            )}
          </div>
        ) : chunks.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No chunks.</p>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={showSearchText} onChange={(e) => setShowSearchText(e.target.checked)} className="accent-[var(--primary)]" />
              Show search text (what keyword search and the embedding are computed from)
            </label>
            {viewing && busy(viewing) && <p className="text-[12px] text-warning">Being re-chunked — these are the current chunks until the new ones are committed.</p>}
            {viewing?.error && !busy(viewing) && <p className="text-[12px] text-danger">Last re-chunk failed, these chunks were kept: {viewing.error}</p>}
            {chunks.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap text-[10px] text-muted-foreground">
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded">#{c.index + 1}</span>
                  <span>{c.content.length.toLocaleString()} chars · ~{c.tokenCount} tokens</span>
                  {c.assets.length > 0 && <span>{c.assets.length} image{c.assets.length === 1 ? '' : 's'}</span>}
                  {c.pageStart && <span>page {c.pageStart}{c.pageEnd && c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ''}</span>}
                  {(c.outlinePath.length > 0 || c.heading) && (
                    <span className="font-600 text-foreground truncate max-w-[420px]" title={c.outlinePath.join(' › ')}>
                      {c.outlinePath.length ? c.outlinePath.join(' › ') : c.heading}
                    </span>
                  )}
                </div>
                {viewing && <ChunkContent documentId={viewing.id} content={c.content} />}
                {showSearchText && c.embeddingText && (
                  <pre className="mt-2 p-2 rounded-md bg-muted text-[11px] text-muted-foreground whitespace-pre-wrap break-words font-mono">{c.embeddingText}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </SlideOver>

      <ChunkModal
        open={!!chunkTargets}
        docs={chunkTargets ?? []}
        defaults={kb?.chunkSettings}
        onProgress={load}
        onClose={(ran) => {
          setChunkTargets(null);
          if (ran) setSelected(new Set());
          if (viewing) {
            const fresh = docs.find((d) => d.id === viewing.id);
            if (fresh) openChunks(fresh);
          }
        }}
      />

      <DocumentEditModal
        doc={editingDoc}
        onClose={() => setEditingDoc(null)}
        onSaved={() => {
          setEditingDoc(null);
          load();
        }}
      />

      <KnowledgeBaseFormModal
        open={editingKb}
        knowledgeBase={kb}
        onClose={() => setEditingKb(false)}
        onSaved={() => {
          setEditingKb(false);
          load();
        }}
      />

      {/* Delete confirm (one or many) */}
      {deleteTargets && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 fade-in">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => !deleting && setDeleteTargets(null)} />
          <div className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-sm scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
                <Icon name="ExclamationTriangleIcon" size={20} variant="outline" className="text-danger" />
              </div>
              <h3 className="text-[15px] font-600 text-foreground">
                {deleteTargets.length === 1 ? 'Delete document?' : `Delete ${deleteTargets.length} documents?`}
              </h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-5">
              {deleteTargets.length === 1 ? `“${deleteTargets[0].title}”` : 'The selected documents'}, the original file
              {deleteTargets.length === 1 ? '' : 's'} and all chunks will be permanently deleted. To keep a document but stop the AI from using it, switch off
              “Enabled” instead.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteTargets(null)} disabled={deleting} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
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
