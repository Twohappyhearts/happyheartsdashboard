'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import { initials } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import {
  ChatError,
  MissingMigrationError,
  listPatients,
  openConversationForPatient,
  patientName,
  type PatientListItem,
} from '@/lib/chat';
import { formatListTime } from './format';
import { useStaffT } from '@/lib/i18n/staff/context';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpened: (conversationId: string) => void;
}

export default function NewChatModal({ open, onClose, onOpened }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const T = useStaffT().t.messages;
  const [patients, setPatients] = useState<PatientListItem[] | null>(null);
  const [error, setError] = useState<{ message: string; migration: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setQuery('');
    listPatients(supabase)
      .then((rows) => !cancelled && setPatients(rows))
      .catch((e) => {
        if (cancelled) return;
        setError({
          message: e instanceof ChatError ? e.message : T.loadPatientsFailed,
          migration: e instanceof MissingMigrationError,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (patients ?? []).filter(
      (p) => !q || p.fullName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)
    );
  }, [patients, query]);

  const choose = async (p: PatientListItem) => {
    if (p.conversationId) return onOpened(p.conversationId);
    setOpening(p.id);
    try {
      const id = await openConversationForPatient(supabase, p.id);
      onOpened(id);
    } catch (e) {
      setError({
        message: e instanceof ChatError ? e.message : T.openFailed,
        migration: e instanceof MissingMigrationError,
      });
    } finally {
      setOpening(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={T.newConversation} size="md">
      {error ? (
        <div className="p-4 rounded-lg border border-danger/30 bg-danger/5 text-[13px] text-foreground space-y-2">
          <p className="font-600 text-danger">{error.migration ? T.setupNeeded : T.failed}</p>
          <p>{error.message}</p>
          {error.migration && (
            <p className="text-muted-foreground">{T.setupHint}</p>
          )}
        </div>
      ) : patients === null ? (
        <div className="py-10 flex justify-center">
          <Icon name="ArrowPathIcon" size={20} variant="outline" className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Icon
              name="MagnifyingGlassIcon"
              size={14}
              variant="outline"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.searchPlaceholder}
              className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {visible.length === 0 ? (
            <p className="text-center text-[13px] text-muted-foreground py-6">
              {patients.length === 0 ? T.noPatients : T.noMatch}
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {visible.map((p) => {
                const name = patientName(p);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => choose(p)}
                      disabled={opening !== null}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 disabled:opacity-60"
                    >
                      <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[11px] font-700 shrink-0">
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-600 text-foreground truncate">{name}</p>
                        {p.username && <p className="text-[11px] font-mono text-muted-foreground truncate">@{p.username}</p>}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {opening === p.id ? (
                          <Icon name="ArrowPathIcon" size={14} variant="outline" className="animate-spin" />
                        ) : p.conversationId ? (
                          p.lastMessageAt ? formatListTime(p.lastMessageAt) : T.open
                        ) : (
                          T.start
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
