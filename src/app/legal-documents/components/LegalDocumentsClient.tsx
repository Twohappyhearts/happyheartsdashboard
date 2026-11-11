'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { fetchProfiles } from '@/lib/chat';
import { formatBytes } from '@/lib/format-bytes';
import {
  LEGAL_KINDS,
  LEGAL_PUBLIC_PATHS,
  LEGAL_SAMPLE_PATHS,
  LegalError,
  MAX_LEGAL_BYTES,
  listLegalDocuments,
  type LegalDocument,
  type LegalKind,
} from '@/lib/legal';
import { LEGAL_TEXT as T } from '../text';

const formatWhen = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

/** Admin page: upload new versions of the Terms of Use and the Privacy Policy. */
export default function LegalDocumentsClient() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' && profile.isActive;
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<LegalDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<LegalKind | null>(null);
  const [confirmTerms, setConfirmTerms] = useState<File | null>(null);
  const [origin, setOrigin] = useState('');
  const inputs = useRef<Partial<Record<LegalKind, HTMLInputElement | null>>>({});

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    try {
      const list = await listLegalDocuments(supabase);
      setDocs(list);
      setLoadError(null);
      const ids = Array.from(new Set(list.map((d) => d.uploadedBy).filter((id): id is string => !!id)));
      const profiles = await fetchProfiles(supabase, ids);
      setNames(Object.fromEntries(profiles.map((p) => [p.id, p.fullName || (p.username ? `@${p.username}` : T.someone)])));
    } catch (e) {
      setLoadError(e instanceof LegalError ? e.message : T.errors.load);
    }
  }, [supabase]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-card">
        <EmptyState icon="LockClosedIcon" title={T.adminOnlyTitle} description={T.adminOnlyBody} />
      </div>
    );
  }

  const upload = async (kind: LegalKind, file: File) => {
    setUploading(kind);
    try {
      const form = new FormData();
      form.set('kind', kind);
      form.set('file', file);
      const res = await fetch('/api/admin/legal', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; document?: LegalDocument };
      if (!res.ok || !body.document) throw new LegalError(body.error || T.errors.upload);
      toast.success(T.uploadedToast(T.kinds[kind].title, body.document.version), {
        description: kind === 'terms' ? T.uploadedTermsToast : undefined,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof LegalError ? e.message : T.errors.upload);
    } finally {
      setUploading(null);
    }
  };

  const onPick = (kind: LegalKind, file: File | undefined) => {
    if (!file) return;
    const looksPdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));
    if (!looksPdf) return void toast.error(T.errors.notPdf);
    if (file.size === 0) return void toast.error(T.errors.empty);
    if (file.size > MAX_LEGAL_BYTES) return void toast.error(T.errors.tooLarge);
    if (kind === 'terms') setConfirmTerms(file);
    else void upload(kind, file);
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(T.copied);
    } catch {
      toast.error(T.copyFailed);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-secondary-foreground max-w-3xl">{T.intro}</p>

      {loadError ? (
        <div className="bg-card rounded-xl border border-border shadow-card p-8 text-center">
          <p className="text-[13px] text-danger mb-3">{loadError}</p>
          <button onClick={() => void load()} className="text-[13px] font-600 text-primary hover:underline">
            {T.errors.retry}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {LEGAL_KINDS.map((kind) => {
            const versions = (docs ?? []).filter((d) => d.kind === kind);
            const current = versions[0] ?? null;
            const publicUrl = `${origin}${LEGAL_PUBLIC_PATHS[kind]}`;
            const busy = uploading === kind;
            return (
              <section key={kind} className="bg-card rounded-xl border border-border shadow-card flex flex-col">
                <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-600 text-foreground">{T.kinds[kind].title}</h2>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{T.kinds[kind].description}</p>
                  </div>
                  <button
                    onClick={() => inputs.current[kind]?.click()}
                    disabled={!!uploading || docs === null}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-[12.5px] font-600 hover:opacity-90 disabled:opacity-60"
                  >
                    <Icon name={busy ? 'ArrowPathIcon' : 'ArrowUpTrayIcon'} size={15} variant="outline" className={busy ? 'animate-spin' : ''} />
                    {busy ? T.uploading : T.upload}
                  </button>
                  <input
                    ref={(el) => {
                      inputs.current[kind] = el;
                    }}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      onPick(kind, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div className="px-5 py-4 space-y-4 flex-1">
                  {/* Current version */}
                  {docs === null ? (
                    <Skeleton className="h-16 w-full" />
                  ) : current ? (
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-700 px-2 py-0.5 rounded-full bg-success/10 text-success">
                          {T.currentVersion(current.version)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{formatBytes(current.sizeBytes)}</span>
                      </div>
                      <a
                        href={current.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[13px] font-600 text-primary hover:underline break-all"
                      >
                        <Icon name="DocumentTextIcon" size={15} variant="outline" className="shrink-0" />
                        {current.fileName}
                      </a>
                      <p className="text-[11.5px] text-muted-foreground mt-1">
                        {T.uploadedOn(formatWhen(current.createdAt), (current.uploadedBy && names[current.uploadedBy]) || T.someone)}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border border-warning/30 bg-warning/5">
                      <span className="text-[11px] font-700 px-2 py-0.5 rounded-full bg-warning/15 text-warning">{T.sampleBadge}</span>
                      <p className="text-[12.5px] text-foreground mt-2">{T.noneUploaded}</p>
                      <a
                        href={LEGAL_SAMPLE_PATHS[kind]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[12px] font-600 text-primary hover:underline mt-1"
                      >
                        {T.openSample} ↗
                      </a>
                    </div>
                  )}

                  {/* Public link */}
                  <div>
                    <p className="text-[12px] font-600 text-foreground mb-1">{T.publicLink}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate text-[12px] font-mono text-muted-foreground bg-muted px-2 py-1.5 rounded">
                        {publicUrl}
                      </code>
                      <button
                        onClick={() => void copyLink(publicUrl)}
                        title={T.copy}
                        aria-label={T.copy}
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Icon name="ClipboardDocumentIcon" size={15} variant="outline" />
                      </button>
                      <a
                        href={LEGAL_PUBLIC_PATHS[kind]}
                        target="_blank"
                        rel="noreferrer"
                        title={T.openFile}
                        aria-label={T.openFile}
                        className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Icon name="ArrowTopRightOnSquareIcon" size={15} variant="outline" />
                      </a>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{T.publicLinkHint}</p>
                  </div>

                  {/* History */}
                  <div>
                    <p className="text-[12px] font-600 text-foreground mb-1.5">{T.history}</p>
                    {docs !== null && versions.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">{T.noHistory}</p>
                    ) : (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border">
                              <th className="text-left px-3 py-2 font-600 text-muted-foreground w-20">{T.historyColumns.version}</th>
                              <th className="text-left px-3 py-2 font-600 text-muted-foreground">{T.historyColumns.file}</th>
                              <th className="text-left px-3 py-2 font-600 text-muted-foreground">{T.historyColumns.uploaded}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {versions.map((d) => (
                              <tr key={d.id} className="border-b border-border last:border-0 align-top">
                                <td className="px-3 py-2 tabular-nums font-600 text-foreground">v{d.version}</td>
                                <td className="px-3 py-2">
                                  <a href={d.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                                    {d.fileName}
                                  </a>
                                  <span className="text-muted-foreground"> · {formatBytes(d.sizeBytes)}</span>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {formatWhen(d.createdAt)}
                                  <br />
                                  {(d.uploadedBy && names[d.uploadedBy]) || T.someone}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={!!confirmTerms}
        onClose={() => setConfirmTerms(null)}
        title={T.termsConfirmTitle}
        size="sm"
        footer={
          <>
            <button
              onClick={() => setConfirmTerms(null)}
              className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted"
            >
              {T.cancel}
            </button>
            <button
              onClick={() => {
                const file = confirmTerms;
                setConfirmTerms(null);
                if (file) void upload('terms', file);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90"
            >
              {T.termsConfirmButton}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
            <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="text-warning" />
          </div>
          <div>
            <p className="text-[13px] text-foreground">{T.termsConfirmBody}</p>
            {confirmTerms && <p className="text-[12px] text-muted-foreground mt-2 break-all">{T.termsConfirmFile(confirmTerms.name)}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
