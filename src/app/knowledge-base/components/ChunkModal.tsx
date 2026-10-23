'use client';

import React, { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import ChunkSettingsFields, { fromDraft, toDraft, type ChunkSettingsDraft } from './ChunkSettingsFields';
import {
  DEFAULT_CHUNK_SETTINGS,
  KnowledgeError,
  chunkDocument,
  type ChunkSettings,
  type KnowledgeDocument,
} from '@/lib/knowledge';

const PRESETS: { label: string; hint: string; settings: ChunkSettings }[] = [
  { label: 'Fine', hint: '512 · ×2', settings: { targetChars: 512, overlapChars: 64, toleranceFactor: 2 } },
  { label: 'Default', hint: '1024 · ×3', settings: DEFAULT_CHUNK_SETTINGS },
  { label: 'Coarse', hint: '2048 · ×3', settings: { targetChars: 2048, overlapChars: 256, toleranceFactor: 3 } },
];

type RowState = { state: 'waiting' | 'running' | 'done' | 'background' | 'failed' | 'skipped'; message?: string };

interface Props {
  open: boolean;
  docs: KnowledgeDocument[];
  /** ran = true once a batch has run (so the caller can clear its selection). */
  onClose: (ran: boolean) => void;
  /** Called after each document finishes so the table can refresh. */
  onProgress: () => void;
  /** The knowledge base's default settings. */
  defaults?: ChunkSettings;
}

export default function ChunkModal({ open, docs, onClose, onProgress, defaults }: Props) {
  const [draft, setDraft] = useState<ChunkSettingsDraft>(toDraft(DEFAULT_CHUNK_SETTINGS));
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reparse, setReparse] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Start from the knowledge base's defaults (else the last settings used).
    const prev = defaults ?? docs.find((d) => d.chunkSettings)?.chunkSettings ?? DEFAULT_CHUNK_SETTINGS;
    setDraft(toDraft(prev));
    setRows({});
    setRunning(false);
    setFinished(false);
    setReparse(false);
    stopRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = fromDraft(draft);
  const problem = typeof parsed === 'string' ? parsed : null;

  const rechunking = docs.filter((d) => d.chunkGeneration).length;
  const anyParsed = docs.some((d) => d.hasParsed);

  const run = async () => {
    if (typeof parsed === 'string') return;
    setRunning(true);
    stopRef.current = false;
    const settings = parsed;
    // One request per document, one at a time: each stays well inside the
    // server's time limit and the list shows progress as it goes.
    for (const doc of docs) {
      if (stopRef.current) {
        setRows((r) => ({ ...r, [doc.id]: { state: 'skipped', message: 'Stopped' } }));
        continue;
      }
      setRows((r) => ({ ...r, [doc.id]: { state: 'running' } }));
      try {
        const res = await chunkDocument(doc.id, settings, reparse);
        setRows((r) => ({
          ...r,
          [doc.id]: !res.ok
            ? {
                state: 'failed',
                message: `${res.error ?? 'Failed'}${doc.chunkGeneration ? ' — previous chunks kept' : ''}`,
              }
            : res.status === 'parsing'
              ? { state: 'background', message: 'MinerU is reading the file — chunks and embeds automatically when done' }
              : { state: 'done', message: `${res.chunkCount} chunks embedded` },
        }));
      } catch (e) {
        setRows((r) => ({ ...r, [doc.id]: { state: 'failed', message: e instanceof KnowledgeError ? e.message : 'Request failed' } }));
      }
      onProgress();
    }
    setRunning(false);
    setFinished(true);
  };

  const done = Object.values(rows).filter((r) => r.state === 'done' || r.state === 'failed' || r.state === 'background').length;
  const failed = Object.values(rows).filter((r) => r.state === 'failed').length;
  const background = Object.values(rows).filter((r) => r.state === 'background').length;

  const footer = (
    <div className="flex items-center justify-between gap-3 w-full">
      <p className="text-[12px] text-muted-foreground">
        {running ? `Chunking ${Math.min(done + 1, docs.length)} of ${docs.length}…` : finished
            ? `Finished — ${done - failed - background} chunked${background ? `, ${background} still being read by MinerU` : ''}${failed ? `, ${failed} failed` : ''}` : `${docs.length} document${docs.length === 1 ? '' : 's'}`}
      </p>
      <div className="flex items-center gap-3">
        {running ? (
          <button
            onClick={() => (stopRef.current = true)}
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150"
          >
            Stop after this one
          </button>
        ) : (
          <button onClick={() => onClose(finished)} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
            {finished ? 'Close' : 'Cancel'}
          </button>
        )}
        {!finished && (
          <button
            onClick={run}
            disabled={running || !!problem || docs.length === 0}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 whitespace-nowrap"
          >
            {running ? 'Chunking…' : `Chunk ${docs.length} document${docs.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={running ? () => undefined : () => onClose(finished)} title="Chunk documents" size="md" footer={footer}>
      <div className="space-y-4">
        <div>
          <p className="text-[12px] font-600 text-foreground mb-2">Chunk settings</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESETS.map((p) => {
              const active =
                typeof parsed !== 'string' &&
                parsed.targetChars === p.settings.targetChars &&
                parsed.overlapChars === p.settings.overlapChars &&
                parsed.toleranceFactor === p.settings.toleranceFactor;
              return (
                <button
                  key={`preset-${p.label}`}
                  type="button"
                  disabled={running || finished}
                  onClick={() => setDraft(toDraft(p.settings))}
                  className={`px-3 py-1.5 rounded-lg border text-[12px] transition-colors duration-150 disabled:opacity-60 ${
                    active ? 'border-primary text-primary font-600' : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {p.label} <span className="text-muted-foreground font-400">· {p.hint}</span>
                </button>
              );
            })}
          </div>
          <ChunkSettingsFields value={draft} onChange={setDraft} disabled={running || finished} />
          {problem && <p className="text-[12px] text-danger mt-2">{problem}</p>}
          {anyParsed && !finished && (
            <label className="flex items-start gap-2 mt-3 text-[12px] text-foreground">
              <input
                type="checkbox"
                checked={reparse}
                disabled={running}
                onChange={(e) => setReparse(e.target.checked)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span>
                Re-read the original file
                <span className="block text-[11px] text-muted-foreground">
                  Off: reuse the text already extracted (fast, no MinerU quota). On: read the file again first (uses MinerU quota for PDF / PowerPoint).
                </span>
              </span>
            </label>
          )}
          {!finished && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Each document is read (if needed), chunked and embedded as one step. If anything fails, nothing is saved
              {rechunking > 0 ? ' and the current chunks stay as they are' : ''}.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border divide-y divide-border max-h-[260px] overflow-y-auto scrollbar-thin">
          {docs.map((d) => {
            const r = rows[d.id];
            return (
              <div key={`chunk-row-${d.id}`} className="px-3 py-2 flex items-center gap-2.5 text-[12px]">
                {!r || r.state === 'waiting' ? (
                  <Icon name="DocumentTextIcon" size={14} variant="outline" className="text-muted-foreground" />
                ) : r.state === 'running' ? (
                  <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin text-muted-foreground" />
                ) : r.state === 'done' ? (
                  <Icon name="CheckCircleIcon" size={14} variant="solid" className="text-success" />
                ) : r.state === 'background' ? (
                  <Icon name="ClockIcon" size={14} variant="outline" className="text-info" />
                ) : r.state === 'skipped' ? (
                  <Icon name="MinusCircleIcon" size={14} variant="outline" className="text-muted-foreground" />
                ) : (
                  <Icon name="ExclamationCircleIcon" size={14} variant="solid" className="text-danger" />
                )}
                <span className="font-500 text-foreground truncate flex-1" title={d.fileName}>{d.title}</span>
                <span className={`truncate max-w-[55%] ${r?.state === 'failed' ? 'text-danger' : 'text-muted-foreground'}`} title={r?.message}>
                  {r?.state === 'running' ? 'Chunking and embedding…' : r?.message ?? ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
