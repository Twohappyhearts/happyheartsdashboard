'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import SlideOver from '@/components/ui/SlideOver';
import { createClient } from '@/lib/supabase/client';
import { useOpenAlerts } from '@/contexts/OpenAlertsContext';
import { initials } from '@/contexts/AuthContext';
import { openConversationForPatient, fetchProfiles, ChatError } from '@/lib/chat';
import {
  ALERT_FILTERS,
  AlertError,
  getAlert,
  listAlerts,
  saveAlertNotes,
  setAlertStatus,
  type AlertFilter,
  type AlertSearch,
  type AlertStatus,
  type AssistanceAlert,
} from '@/lib/alerts';
import { useStaffT } from '@/lib/i18n/staff/context';
import { staffText } from '@/lib/i18n/staff';

const NOTES_MAX = 5000;

function formatOccurred(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeAgo(iso: string) {
  const T = staffText().alerts.ago;
  const diffM = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffM < 1) return T.justNow;
  if (diffM < 60) return T.minutes(diffM);
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return T.hours(diffH);
  return T.days(Math.floor(diffH / 24));
}

export default function AlertsClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { counts, version, refresh: refreshCounts } = useOpenAlerts();
  const { t, locale } = useStaffT();
  const T = t.alerts;
  const fmtOccurred = (iso: string) => formatOccurred(iso, locale);

  const [filter, setFilter] = useState<AlertFilter>('open');
  // Search: participant name/username + Occurred date range.
  const [participantInput, setParticipantInput] = useState('');
  const [participant, setParticipant] = useState(''); // debounced
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [alerts, setAlerts] = useState<AssistanceAlert[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Detail panel (slides in from the right when a row is clicked).
  const [selected, setSelected] = useState<AssistanceAlert | null>(null);
  const [panelDraft, setPanelDraft] = useState('');
  const [panelSaving, setPanelSaving] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setParticipant(participantInput.trim()), 300);
    return () => clearTimeout(t);
  }, [participantInput]);

  const search: AlertSearch = useMemo(
    () => ({ participant, from: fromDate || undefined, to: toDate || undefined }),
    [participant, fromDate, toDate]
  );
  const searching = !!(participant || fromDate || toDate);
  const dateRangeInvalid = !!(fromDate && toDate && fromDate > toDate);

  const clearSearch = () => {
    setParticipantInput('');
    setParticipant('');
    setFromDate('');
    setToDate('');
  };
  const namesRef = useRef(names);
  namesRef.current = names;

  const resolveNames = useCallback(
    async (rows: AssistanceAlert[]) => {
      const ids = new Set<string>();
      rows.forEach((a) =>
        [a.acknowledgedBy, a.resolvedBy, a.notesUpdatedBy].forEach((id) => {
          if (id && !(id in namesRef.current)) ids.add(id);
        })
      );
      if (ids.size === 0) return;
      const profiles = await fetchProfiles(supabase, Array.from(ids));
      setNames((prev) => ({
        ...prev,
        ...Object.fromEntries(profiles.map((p) => [p.id, p.fullName || (p.username ? `@${p.username}` : staffText().alerts.staff)])),
      }));
    },
    [supabase]
  );

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const seq = ++loadSeq.current;
      if (!opts.silent) setLoading(true);
      try {
        const rows = await listAlerts(supabase, filter, search);
        if (seq !== loadSeq.current) return; // a newer load (e.g. filter change) won
        setAlerts(rows);
        setError(null);
        void resolveNames(rows);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        setError(e instanceof AlertError ? e.message : staffText().alerts.loadFailed);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [supabase, filter, search, resolveNames]
  );

  // Keep the open panel in sync with fresh data (the row may have left the
  // current filter, e.g. after Resolve in the Open view: then fetch it).
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId || !alerts) return;
    const fresh = alerts.find((a) => a.id === selectedId);
    if (fresh) {
      setSelected(fresh);
    } else {
      getAlert(supabase, selectedId)
        .then((a) => a && setSelected((cur) => (cur?.id === a.id ? a : cur)))
        .catch(() => {});
    }
  }, [alerts, selectedId, supabase]);

  const openDetail = (a: AssistanceAlert) => {
    setSelected(a);
    setPanelDraft(a.notes);
  };

  const savePanelNotes = async () => {
    if (!selected) return;
    if (panelDraft.length > NOTES_MAX) {
      toast.error(T.notesTooLong(NOTES_MAX));
      return;
    }
    setPanelSaving(true);
    try {
      await saveAlertNotes(supabase, selected.id, panelDraft.trim());
      toast.success(T.notesSaved);
      await load({ silent: true });
      const fresh = await getAlert(supabase, selected.id);
      if (fresh) setSelected(fresh);
    } catch (e) {
      toast.error(e instanceof AlertError ? e.message : T.notesFailed);
    } finally {
      setPanelSaving(false);
    }
  };

  // Initial load + whenever the filter changes.
  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: the app-wide provider bumps `version` on every change.
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version === firstVersion.current) return;
    void load({ silent: true });
  }, [version, load]);

  const run = async (id: string, work: () => Promise<void>, success: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await work();
      toast.success(success);
      await Promise.all([load({ silent: true }), refreshCounts()]);
    } catch (e) {
      toast.error(e instanceof AlertError || e instanceof ChatError ? e.message : T.failed);
    } finally {
      setBusy((b) => {
        const { [id]: _done, ...rest } = b;
        return rest;
      });
    }
  };

  const changeStatus = (a: AssistanceAlert, status: AlertStatus) =>
    run(
      a.id,
      () => setAlertStatus(supabase, a.id, status),
      status === 'ACK'
        ? T.markedSeen
        : status === 'RESOLVED'
          ? T.resolved
          : T.reopened
    );

  const saveNotes = async () => {
    if (!editing) return;
    if (editing.draft.length > NOTES_MAX) {
      toast.error(T.notesTooLong(NOTES_MAX));
      return;
    }
    setSavingNotes(true);
    try {
      await saveAlertNotes(supabase, editing.id, editing.draft.trim());
      toast.success(T.notesSaved);
      setEditing(null);
      await load({ silent: true });
    } catch (e) {
      toast.error(e instanceof AlertError ? e.message : T.notesFailed);
    } finally {
      setSavingNotes(false);
    }
  };

  const openChat = (a: AssistanceAlert) =>
    run(
      a.id,
      async () => {
        const conversationId = await openConversationForPatient(supabase, a.patientId);
        router.push(`/messages?c=${encodeURIComponent(conversationId)}`);
      },
      T.openingChat(a.patientName)
    );

  const staffName = (id: string | null) => (id ? names[id] || T.teamMember : T.teamMember);
  const rows = alerts ?? [];
  const newCount = counts?.new ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
            {newCount > 0 && (
              <span className="bg-danger text-white text-[11px] font-700 rounded-full px-2 py-0.5 leading-none">
                {T.newBadge(newCount)}
              </span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              void load();
              void refreshCounts();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-[13px] font-500 text-foreground hover:bg-muted transition-colors duration-150 disabled:opacity-60"
          >
            <Icon name="ArrowPathIcon" size={14} variant="outline" className={loading ? 'animate-spin' : ''} />
            {T.refresh}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: T.stats.new, value: counts?.new, color: 'text-danger', bg: 'bg-danger/5 border-danger/20' },
          { label: T.stats.seen, value: counts?.ack, color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
          { label: T.stats.resolvedToday, value: counts?.resolvedToday, color: 'text-success', bg: 'bg-success/5 border-success/20' },
          {
            label: T.stats.totalOpen,
            value: counts ? counts.new + counts.ack : undefined,
            color: 'text-foreground',
            bg: 'bg-card border-border',
          },
        ].map((stat) => (
          <div key={`stat-${stat.label}`} className={`rounded-xl border p-4 ${stat.bg}`}>
            <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-[28px] font-700 tabular-nums ${stat.color}`}>{stat.value ?? '–'}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit flex-wrap">
        {ALERT_FILTERS.map((f) => (
          <button
            key={`filter-${f}`}
            onClick={() => {
              setEditing(null);
              setFilter(f);
            }}
            className={`
              px-3 py-1.5 rounded-md text-[12px] font-500 transition-all duration-150
              ${filter === f ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            {T.filters[f]}
            {f === 'new' && newCount > 0 && (
              <span className="ml-1.5 bg-danger text-white text-[9px] font-700 rounded-full px-1 py-0.5 leading-none">
                {newCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <label htmlFor="alert-search" className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">
            {T.participant}
          </label>
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            variant="outline"
            className="absolute left-3 bottom-[11px] text-muted-foreground pointer-events-none"
          />
          <input
            id="alert-search"
            type="search"
            value={participantInput}
            onChange={(e) => setParticipantInput(e.target.value)}
            placeholder={T.searchPlaceholder}
            className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] text-foreground bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="alert-from" className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">
            {T.from}
          </label>
          <input
            id="alert-from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-[7px] border border-border rounded-lg text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="alert-to" className="block text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-1">
            {T.to}
          </label>
          <input
            id="alert-to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-[7px] border border-border rounded-lg text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {searching && (
          <button
            onClick={clearSearch}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-500 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
          >
            <Icon name="XMarkIcon" size={14} variant="outline" />
            {T.clear}
          </button>
        )}
        {searching && alerts && !loading && (
          <p className="text-[12px] text-muted-foreground pb-2.5">
            {T.results(alerts.length, T.filters[filter])}
          </p>
        )}
      </div>
      {dateRangeInvalid && (
        <p className="text-[12px] text-danger -mt-2">{T.badRange}</p>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {(['occurred', 'participant', 'message', 'status', 'notes', 'actions'] as const).map((h) => (
                  <th
                    key={h}
                    className={`text-left px-5 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wider ${
                      h === 'message' ? 'w-[30%]' : h === 'notes' ? 'w-[24%]' : ''
                    }`}
                  >
                    {T.columns[h]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && alerts === null ? (
                [0, 1, 2].map((i) => (
                  <tr key={`sk-${i}`} className="border-b border-border last:border-0 animate-pulse">
                    {[0, 1, 2, 3, 4, 5].map((j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error && alerts === null ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="text-[13px] text-danger mb-3">{error}</p>
                    <button onClick={() => void load()} className="text-[13px] font-600 text-primary hover:underline">
                      {T.tryAgain}
                    </button>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {searching ? (
                      <EmptyState
                        icon="MagnifyingGlassIcon"
                        title={T.noMatchTitle}
                        description={T.noMatchBody(T.filters[filter])}
                        action={{ label: T.clearSearch, onClick: clearSearch }}
                      />
                    ) : (
                      <EmptyState
                        icon="BellSlashIcon"
                        title={filter === 'open' ? T.noOpenTitle : T.noneInFilter(T.filters[filter])}
                        description={filter === 'open' ? T.noOpenBody : T.noneInFilterBody}
                      />
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((a) => {
                  const isBusy = !!busy[a.id];
                  const isEditing = editing?.id === a.id;
                  const long = a.message.length > 160;
                  const showFull = expanded[a.id];
                  return (
                    <tr
                      key={a.id}
                      onClick={() => !isEditing && openDetail(a)}
                      className={`border-b border-border last:border-0 align-top cursor-pointer transition-colors ${
                        a.status === 'NEW'
                          ? 'bg-danger/[0.03] hover:bg-danger/[0.07]'
                          : a.status === 'ACK'
                            ? 'bg-warning/[0.03] hover:bg-warning/[0.07]'
                            : 'hover:bg-muted/40'
                      } ${selected?.id === a.id ? 'ring-1 ring-inset ring-primary/40' : ''}`}
                    >
                      {/* Occurred */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="text-[13px] text-foreground tabular-nums">{fmtOccurred(a.createdAt)}</p>
                        <p className="text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
                      </td>

                      {/* Participant */}
                      <td className="px-5 py-4">
                        <p className="text-[13px] font-600 text-foreground">{a.patientName}</p>
                        {a.username && <p className="text-[11px] font-mono text-muted-foreground">@{a.username}</p>}
                      </td>

                      {/* Message */}
                      <td className="px-5 py-4">
                        <p
                          className={`text-[13px] text-foreground whitespace-pre-wrap break-words ${
                            long && !showFull ? 'line-clamp-3' : ''
                          }`}
                        >
                          {a.message}
                        </p>
                        {long && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded((x) => ({ ...x, [a.id]: !showFull }));
                            }}
                            className="text-[11px] font-600 text-primary hover:underline mt-1"
                          >
                            {showFull ? T.showLess : T.showMore}
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {a.status === 'NEW' && <Badge variant="new" label={T.status.NEW} />}
                        {a.status === 'ACK' && <Badge variant="ack" label={T.status.ACK} />}
                        {a.status === 'RESOLVED' && <Badge variant="resolved" label={T.status.RESOLVED} />}
                        {a.status === 'ACK' && a.acknowledgedAt && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {T.by(staffName(a.acknowledgedBy), timeAgo(a.acknowledgedAt))}
                          </p>
                        )}
                        {a.status === 'RESOLVED' && a.resolvedAt && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {T.by(staffName(a.resolvedBy), timeAgo(a.resolvedAt))}
                          </p>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-5 py-4" onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              autoFocus
                              value={editing.draft}
                              onChange={(e) => setEditing({ id: a.id, draft: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditing(null);
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveNotes();
                              }}
                              rows={4}
                              placeholder={T.notesPlaceholder}
                              className="w-full px-2.5 py-2 border border-border rounded-lg text-[12.5px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void saveNotes()}
                                disabled={savingNotes}
                                className="px-2.5 py-1 bg-primary text-primary-foreground rounded-md text-[11.5px] font-600 hover:opacity-90 disabled:opacity-60"
                              >
                                {savingNotes ? T.saving : T.save}
                              </button>
                              <button
                                onClick={() => setEditing(null)}
                                disabled={savingNotes}
                                className="px-2.5 py-1 border border-border rounded-md text-[11.5px] font-500 text-foreground hover:bg-muted"
                              >
                                {T.cancel}
                              </button>
                              <span
                                className={`ml-auto text-[10.5px] tabular-nums ${
                                  editing.draft.length > NOTES_MAX ? 'text-danger font-600' : 'text-muted-foreground'
                                }`}
                              >
                                {editing.draft.length}/{NOTES_MAX}
                              </span>
                            </div>
                          </div>
                        ) : a.notes ? (
                          <div>
                            <p className="text-[12.5px] text-foreground whitespace-pre-wrap break-words line-clamp-4">
                              {a.notes}
                            </p>
                            {a.notesUpdatedAt && (
                              <p className="text-[10.5px] text-muted-foreground mt-1">
                                {staffName(a.notesUpdatedBy)} · {timeAgo(a.notesUpdatedAt)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {a.status === 'NEW' && (
                            <button
                              onClick={() => void changeStatus(a, 'ACK')}
                              disabled={isBusy}
                              title={T.markSeenHint}
                              className="px-2 py-1 bg-warning/10 text-warning rounded-md text-[11px] font-600 hover:bg-warning/20 disabled:opacity-50 whitespace-nowrap"
                            >
                              {T.markSeen}
                            </button>
                          )}
                          {a.status !== 'RESOLVED' && (
                            <button
                              onClick={() => void changeStatus(a, 'RESOLVED')}
                              disabled={isBusy}
                              title={T.resolveHint}
                              className="px-2 py-1 bg-success/10 text-success rounded-md text-[11px] font-600 hover:bg-success/20 disabled:opacity-50"
                            >
                              {T.resolve}
                            </button>
                          )}
                          {a.status === 'RESOLVED' && (
                            <button
                              onClick={() => void changeStatus(a, 'NEW')}
                              disabled={isBusy}
                              title={T.reopenHint}
                              className="px-2 py-1 bg-muted text-foreground rounded-md text-[11px] font-600 hover:bg-secondary disabled:opacity-50"
                            >
                              {T.reopen}
                            </button>
                          )}
                          <button
                            onClick={() => openDetail(a)}
                            title={T.viewHint}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Icon name="ChatBubbleLeftEllipsisIcon" size={15} variant="outline" />
                          </button>
                          <button
                            onClick={() => setEditing({ id: a.id, draft: a.notes })}
                            disabled={isBusy || isEditing}
                            title={T.editNotes}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                          >
                            <Icon name="PencilSquareIcon" size={15} variant="outline" />
                          </button>
                          <button
                            onClick={() => void openChat(a)}
                            disabled={isBusy}
                            title={T.openChatWith(a.patientName)}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                          >
                            <Icon name="ChatBubbleLeftRightIcon" size={15} variant="outline" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {alerts && alerts.length >= 500 && (
          <p className="px-5 py-3 text-[11px] text-muted-foreground border-t border-border">
            {T.first500}
          </p>
        )}
      </div>

      {/* Detail SlideOver */}
      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        dirty={!!selected && panelDraft.trim() !== selected.notes.trim()}
        title={T.detailTitle}
        subtitle={selected ? `${selected.patientName} · ${fmtOccurred(selected.createdAt)}` : ''}
        width="md"
        footer={
          selected ? (
            selected.status === 'RESOLVED' ? (
              <button
                onClick={() => void changeStatus(selected, 'NEW')}
                disabled={!!busy[selected.id]}
                className="px-4 py-2 border border-border rounded-lg text-[13px] font-600 text-foreground hover:bg-muted disabled:opacity-60"
              >
                {T.reopen}
              </button>
            ) : (
              <>
                {selected.status === 'NEW' && (
                  <button
                    onClick={() => void changeStatus(selected, 'ACK')}
                    disabled={!!busy[selected.id]}
                    className="px-4 py-2 bg-warning/10 text-warning border border-warning/20 rounded-lg text-[13px] font-600 hover:bg-warning/20 transition-colors duration-150 disabled:opacity-60"
                  >
                    {T.markSeen}
                  </button>
                )}
                <button
                  onClick={() => void changeStatus(selected, 'RESOLVED')}
                  disabled={!!busy[selected.id]}
                  className="px-4 py-2 bg-success text-white rounded-lg text-[13px] font-600 hover:opacity-90 transition-opacity duration-150 disabled:opacity-60"
                >
                  {T.markResolved}
                </button>
              </>
            )
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-5">
            {/* Status */}
            <div className="flex items-center gap-2">
              {selected.status === 'NEW' && <Badge variant="new" label={T.status.NEW} />}
              {selected.status === 'ACK' && <Badge variant="ack" label={T.status.ACK} />}
              {selected.status === 'RESOLVED' && <Badge variant="resolved" label={T.status.RESOLVED} />}
            </div>

            {/* Patient info */}
            <div className="p-3 bg-muted/40 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[13px] font-700 shrink-0">
                  {initials(selected.patientName)}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-600 text-foreground truncate">{selected.patientName}</p>
                  {selected.username && (
                    <p className="text-[11px] font-mono text-muted-foreground">@{selected.username}</p>
                  )}
                </div>
                <div className="ml-auto">
                  <button
                    onClick={() => void openChat(selected)}
                    disabled={!!busy[selected.id]}
                    title={T.openChatHint}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[12px] font-500 text-foreground hover:bg-muted transition-colors duration-150 disabled:opacity-60"
                  >
                    <Icon name="ChatBubbleLeftRightIcon" size={13} variant="outline" />
                    {T.openChat}
                  </button>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">{T.timeline}</p>
              <ul className="space-y-1.5 text-[13px] text-foreground">
                <li>
                  <span className="text-muted-foreground">{T.received}</span> {fmtOccurred(selected.createdAt)} ·{' '}
                  {timeAgo(selected.createdAt)}
                </li>
                {selected.acknowledgedAt && (
                  <li>
                    <span className="text-muted-foreground">{T.seenAt}</span> {fmtOccurred(selected.acknowledgedAt)}{' '}
                    {T.byName(staffName(selected.acknowledgedBy))}
                  </li>
                )}
                {selected.resolvedAt && (
                  <li>
                    <span className="text-muted-foreground">{T.resolvedAt}</span> {fmtOccurred(selected.resolvedAt)}{' '}
                    {T.byName(staffName(selected.resolvedBy))}
                  </li>
                )}
              </ul>
            </div>

            {/* Full message */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">{T.patientMessage}</p>
              <div className="p-4 bg-muted/30 rounded-lg border border-border">
                <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {selected.message}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wider mb-2">
                {T.staffNotes} <span className="normal-case font-400">{T.staffOnly}</span>
              </p>
              <textarea
                value={panelDraft}
                onChange={(e) => setPanelDraft(e.target.value)}
                rows={5}
                placeholder={T.notesPlaceholder}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-[13px] text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-muted-foreground">
                  {selected.notesUpdatedAt
                    ? T.lastEdited(staffName(selected.notesUpdatedBy), timeAgo(selected.notesUpdatedAt))
                    : `${panelDraft.length}/${NOTES_MAX}`}
                </span>
                <button
                  onClick={() => void savePanelNotes()}
                  disabled={panelSaving || panelDraft.trim() === selected.notes.trim()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 transition-all duration-150 disabled:opacity-50"
                >
                  {panelSaving ? (
                    <>
                      <Icon name="ArrowPathIcon" size={12} variant="outline" className="animate-spin" />
                      {T.saving}
                    </>
                  ) : (
                    T.saveNotes
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
