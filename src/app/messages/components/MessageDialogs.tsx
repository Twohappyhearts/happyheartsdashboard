'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { ChatError, MAX_REASON_LENGTH, type ChatMessage, type MessageRevision } from '@/lib/chat';
import { useStaffT } from '@/lib/i18n/staff/context';

export type MessageDialog =
  | { kind: 'delete'; message: ChatMessage }
  | { kind: 'remove'; message: ChatMessage }
  | { kind: 'history'; message: ChatMessage };

interface Props {
  dialog: MessageDialog;
  isAdmin: boolean;
  /** Text shown for a deleted message (who deleted it). */
  tombstone: (m: ChatMessage) => string;
  onClose: () => void;
  onDelete: (m: ChatMessage, reason?: string) => Promise<boolean>;
  onRestore: (m: ChatMessage) => Promise<boolean>;
  onPurge: (m: ChatMessage, reason: string) => Promise<boolean>;
  loadHistory: (m: ChatMessage) => Promise<MessageRevision[]>;
}

function Modal({ title, icon, danger, children, onClose }: {
  title: string;
  icon: string;
  danger?: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 fade-in">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative bg-card rounded-xl shadow-modal p-6 w-full max-w-md scale-in">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-danger/10' : 'bg-muted'}`}>
            <Icon name={icon} size={20} variant="outline" className={danger ? 'text-danger' : 'text-muted-foreground'} />
          </div>
          <h3 className="text-[15px] font-600 text-foreground">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReasonField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-600 text-muted-foreground">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={MAX_REASON_LENGTH}
        autoFocus
        className="resize-none px-3 py-2 border border-border rounded-lg text-[13px] font-400 text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

export default function MessageDialogs({ dialog, isAdmin, tombstone, onClose, onDelete, onRestore, onPurge, loadHistory }: Props) {
  const { t, locale } = useStaffT();
  const T = t.messages;
  const m = dialog.message;
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<MessageRevision[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    if (dialog.kind !== 'history') return;
    let cancelled = false;
    loadHistory(m)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((e) => {
        if (!cancelled) setHistoryError(e instanceof ChatError ? e.message : T.errors.historyFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [dialog.kind, m.id]);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) onClose();
  };

  const close = () => !busy && onClose();
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const buttons = 'px-4 py-2 rounded-lg text-[13px] font-600 transition-opacity disabled:opacity-50';
  const cancelButton = (
    <button onClick={close} disabled={busy} className={`${buttons} border border-border text-foreground hover:bg-muted`}>
      {t.common.cancel}
    </button>
  );

  if (dialog.kind === 'delete') {
    return (
      <Modal title={T.deleteTitle} icon="TrashIcon" danger onClose={close}>
        <div className="flex justify-end gap-3">
          {cancelButton}
          <button onClick={() => run(() => onDelete(m))} disabled={busy} className={`${buttons} bg-danger text-white hover:opacity-90`}>
            {t.common.delete}
          </button>
        </div>
      </Modal>
    );
  }

  if (dialog.kind === 'remove') {
    const ok = reason.trim().length > 0;
    return (
      <Modal title={T.removeTitle} icon="NoSymbolIcon" danger onClose={close}>
        <blockquote className="mb-4 px-3 py-2 rounded-lg bg-background text-[13px] text-secondary-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
          {m.content}
        </blockquote>
        <ReasonField value={reason} onChange={setReason} label={T.reason} />
        <div className="flex justify-end gap-3 mt-5">
          {cancelButton}
          <button
            onClick={() => run(() => onDelete(m, reason.trim()))}
            disabled={busy || !ok}
            className={`${buttons} bg-danger text-white hover:opacity-90`}
          >
            {t.common.remove}
          </button>
        </div>
      </Modal>
    );
  }

  // History
  const actionLabel: Record<MessageRevision['action'], string> = T.revisionActions;
  return (
    <Modal title={T.historyTitle} icon="ClockIcon" onClose={close}>
      <div className="max-h-[50vh] overflow-y-auto scrollbar-thin -mx-1 px-1 space-y-3">
        {historyError ? (
          <p className="text-[13px] text-danger">{historyError}</p>
        ) : !history ? (
          <div className="flex justify-center py-6">
            <Icon name="ArrowPathIcon" size={18} variant="outline" className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {history.map((r) => (
              <div key={r.id} className="text-[12.5px]">
                <p className="text-muted-foreground">
                  <span className="font-600 text-foreground">{actionLabel[r.action]}</span>
                  {' · '}
                  {r.actorName ?? r.actorRole} · {when(r.createdAt)}
                </p>
                {r.reason && <p className="mt-0.5 text-secondary-foreground">{T.reasonValue(r.reason)}</p>}
                {(r.action === 'edit' || r.action === 'delete') && (
                  <p
                    className={`mt-1 px-3 py-2 rounded-lg bg-background whitespace-pre-wrap break-words ${
                      r.content == null ? 'italic text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {r.content ?? T.textErased}
                  </p>
                )}
              </div>
            ))}
            <div className="text-[12.5px] pt-1 border-t border-border">
              <p className="pt-2 font-600 text-foreground">{T.current}</p>
              <p
                className={`mt-1 px-3 py-2 rounded-lg bg-background whitespace-pre-wrap break-words ${
                  m.deletedAt ? 'italic text-muted-foreground' : 'text-foreground'
                }`}
              >
                {m.deletedAt ? tombstone(m) : m.content}
              </p>
            </div>
          </>
        )}
      </div>

      {isAdmin && purging ? (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-[13px] font-600 text-danger mb-3">{T.purgeTitle}</p>
          <ReasonField value={reason} onChange={setReason} label={T.reason} />
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setPurging(false)} disabled={busy} className={`${buttons} border border-border text-foreground hover:bg-muted`}>
              {t.common.cancel}
            </button>
            <button
              onClick={() => run(() => onPurge(m, reason.trim()))}
              disabled={busy || !reason.trim()}
              className={`${buttons} bg-danger text-white hover:opacity-90`}
            >
              {T.purge}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-3 mt-5">
          {isAdmin && !m.purged && (
            <button onClick={() => setPurging(true)} disabled={busy} className={`${buttons} border border-danger/40 text-danger hover:bg-danger/5`}>
              {T.purge}
            </button>
          )}
          {isAdmin && m.deletedAt && !m.purged && (
            <button onClick={() => run(() => onRestore(m))} disabled={busy} className={`${buttons} border border-border text-foreground hover:bg-muted`}>
              {T.restore}
            </button>
          )}
          <button onClick={close} disabled={busy} className={`${buttons} bg-primary text-primary-foreground hover:opacity-90`}>
            {t.common.close}
          </button>
        </div>
      )}
    </Modal>
  );
}
