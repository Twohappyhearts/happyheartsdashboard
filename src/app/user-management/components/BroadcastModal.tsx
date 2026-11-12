'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { displayName } from '@/contexts/AuthContext';
import { BROADCAST_MAX, UsersError, broadcastMessage, type ManagedUser } from '@/lib/users';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  open: boolean;
  users: ManagedUser[];
  onClose: () => void;
  onSent: () => void;
}

/**
 * Broadcast Message: one chat message to many patients at once. It arrives in
 * each patient's Chat tab in the app (care-team conversation). Careteam and
 * Admin accounts have no app chat, so only active patients can be selected.
 */
export default function BroadcastModal({ open, users, onClose, onSent }: Props) {
  const recipients = useMemo(() => users.filter((u) => u.role === 'patient' && u.active), [users]);
  const T = useStaffT().t.users.broadcastForm;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setMessage('');
      setSearch('');
    }
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.displayId.toLowerCase().includes(q),
    );
  }, [recipients, search]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const trimmed = message.trim();
  const canSend = selected.size > 0 && trimmed.length > 0 && message.length <= BROADCAST_MAX && !sending;
  // A written message or picked recipients: closing asks before discarding them.
  const dirty = trimmed.length > 0 || selected.size > 0;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const n = await broadcastMessage(createClient(), [...selected], trimmed);
      toast.success(T.sent(n));
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof UsersError ? e.message : T.failed);
    } finally {
      setSending(false);
    }
  };

  const quickBtn =
    'px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={T.title}
      size="lg"
      dirty={dirty}
      footer={(requestClose) => (
        <>
          <button onClick={requestClose} className="px-4 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150">
            {T.cancel}
          </button>
          <button
            onClick={send}
            disabled={!canSend}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
            ) : (
              <Icon name="PaperAirplaneIcon" size={14} variant="outline" />
            )}
            {T.sendTo(selected.size)}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button className={quickBtn} onClick={() => setSelected(new Set(recipients.map((u) => u.id)))}>
            {T.allPatients}
          </button>
          <button className={quickBtn} onClick={() => setSelected(new Set())}>
            {T.clearSelection}
          </button>
          <span className="text-[12px] text-muted-foreground ml-auto">
            {T.selected(selected.size, recipients.length)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">{T.hint}</p>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={13} variant="outline" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={T.filter}
                className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-[12px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto scrollbar-thin divide-y divide-border">
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                {recipients.length === 0 ? T.noPatients : T.noMatch}
              </p>
            ) : (
              visible.map((u) => (
                <label key={`bc-${u.id}`} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-muted/30">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} className="accent-[var(--primary)]" />
                  <span className="text-[13px] text-foreground">{displayName({ fullName: u.fullName, username: u.username })}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">@{u.username}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div>
          <label htmlFor="bc-message" className="block text-[13px] font-500 text-foreground mb-1">{T.message}</label>
          <textarea
            id="bc-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, BROADCAST_MAX))}
            rows={5}
            placeholder={T.messagePlaceholder}
            className="w-full px-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className={`text-[11px] mt-1 text-right tabular-nums ${message.length >= BROADCAST_MAX ? 'text-danger' : 'text-muted-foreground'}`}>
            {T.characters(message.length, BROADCAST_MAX)}
          </p>
        </div>
      </div>
    </Modal>
  );
}
