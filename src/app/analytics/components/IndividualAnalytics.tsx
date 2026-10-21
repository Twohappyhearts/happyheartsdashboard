'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { createClient } from '@/lib/supabase/client';
import { displayName, initials } from '@/contexts/AuthContext';
import {
  AnalyticsError,
  countActiveSessions,
  downloadCsv,
  fmtDuration,
  getPatientLessons,
  getPatientVisits,
  listPatients,
  todayStamp,
  type PatientLesson,
  type PatientSummary,
  type PatientVisit,
} from '@/lib/analytics';
import type { ExportFn } from './AnalyticsClient';

interface Props {
  refreshKey: number;
  onLoaded: () => void;
  onExportReady: (fn: ExportFn) => void;
}

function fmtTime(sec: number): string {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m === 0) return `${Math.round(sec)}s`;
  return `${m}m`;
}

function fmtDate(iso: string | null, withTime = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

function EventDot({ active, color, title }: { active: boolean; color: string; title?: string }) {
  return (
    <span title={title} className={`w-2.5 h-2.5 rounded-full inline-block ${active ? color : 'bg-muted'}`} />
  );
}

function nameOf(u: PatientSummary) {
  return displayName({ fullName: u.fullName, username: u.username });
}

function VisitChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[11px] font-500 text-foreground">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

export default function IndividualAnalytics({ refreshKey, onLoaded, onExportReady }: Props) {
  const [users, setUsers] = useState<PatientSummary[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lessons, setLessons] = useState<PatientLesson[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Patient list
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    setListLoading(true);
    setError(null);
    Promise.all([listPatients(supabase), countActiveSessions(supabase)])
      .then(([list, total]) => {
        if (cancelled) return;
        setUsers(list);
        setTotalSessions(total);
        setSelectedId((cur) => (cur && list.some((u) => u.id === cur) ? cur : list[0]?.id ?? null));
        onLoaded();
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof AnalyticsError ? e.message : 'Could not load patients.');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, onLoaded]);

  // Selected patient's lessons + recent visits
  useEffect(() => {
    if (!selectedId) {
      setLessons([]);
      setVisits([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    setDetailLoading(true);
    setDetailError(null);
    Promise.all([getPatientLessons(supabase, selectedId), getPatientVisits(supabase, selectedId, 30)])
      .then(([l, v]) => {
        if (cancelled) return;
        setLessons(l);
        setVisits(v);
      })
      .catch((e) => {
        if (cancelled) return;
        setLessons([]);
        setVisits([]);
        setDetailError(e instanceof AnalyticsError ? e.message : 'Could not load this patient’s activity.');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshKey]);

  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

  // Export = the selected patient's per-lesson activity.
  useEffect(() => {
    if (!selectedUser || detailLoading || detailError) {
      onExportReady(null);
      return;
    }
    const who = selectedUser.username || selectedUser.id.slice(0, 8);
    onExportReady(() =>
      downloadCsv(
        `patient-activity-${who}-${todayStamp()}.csv`,
        [
          'Patient', 'Username', 'Session', 'Group ID', 'Opened', 'Visits', 'Time on page (s)', 'Video played',
          'Video watch time (s)', 'Watched >=80%', 'Audio played', 'Audio listen time (s)', 'Infographic opened',
          'Infographic time (s)', 'Notes read', 'Notes reading time (s)', 'Quiz started', 'Quiz finished',
          'Completed', 'Completed at', 'Last opened',
        ],
        lessons.map((l) => [
          nameOf(selectedUser), selectedUser.username, l.title, l.groupId, l.opened ? 'yes' : 'no', l.visits,
          l.timeOnPageSec, l.videoPlayed ? 'yes' : 'no', l.videoSec, l.watchedVideo ? 'yes' : 'no',
          l.audioPlayed ? 'yes' : 'no', l.audioSec, l.infographicViewed ? 'yes' : 'no', l.infographicSec,
          l.scriptRead ? 'yes' : 'no', l.scriptSec, l.quizStarted ? 'yes' : 'no', l.quizCompleted ? 'yes' : 'no',
          l.completed ? 'yes' : 'no', l.completedAt ?? '', l.lastOpenedAt ?? '',
        ]),
      ),
    );
    return () => onExportReady(null);
  }, [selectedUser, lessons, detailLoading, detailError, onExportReady]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.displayId ?? '').toLowerCase().includes(q),
    );
  }, [users, search]);

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-card p-5 flex items-center gap-3">
        <Icon name="ExclamationTriangleIcon" size={18} variant="outline" className="text-danger shrink-0" />
        <p className="text-[13px] text-foreground">{error}</p>
      </div>
    );
  }

  const selectedName = selectedUser ? nameOf(selectedUser) : '';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
      {/* User list */}
      <div className="xl:col-span-1 bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={13} variant="outline" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find patient..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-[12px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[500px] scrollbar-thin">
          {listLoading && users.length === 0 ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`u-skel-${i}`} className="h-12 w-full" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
              {users.length === 0 ? 'No patient accounts yet.' : 'No patients match your search.'}
            </p>
          ) : (
            filteredUsers.map(user => {
              const name = nameOf(user);
              return (
                <button
                  key={`ulist-${user.id}`}
                  onClick={() => setSelectedId(user.id)}
                  className={`
                    w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors duration-100
                    ${selectedId === user.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/30'}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[11px] font-700 shrink-0">
                      {initials(name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-600 text-foreground truncate">{name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        @{user.username}
                        {user.displayId ? ` · ${user.displayId}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 pl-9">
                    <span className="text-[10px] text-muted-foreground">{user.lessonsOpened}/{totalSessions} sessions</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{fmtTime(user.totalTimeSec)}</span>
                    {!user.active && (
                      <>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-warning">inactive</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="xl:col-span-3 space-y-4">
        {!selectedUser ? (
          <div className="bg-card rounded-xl border border-border shadow-card p-10 text-center text-[13px] text-muted-foreground">
            {listLoading ? 'Loading…' : 'Select a patient to see their activity.'}
          </div>
        ) : (
          <>
            {/* User summary */}
            <div className="bg-card rounded-xl border border-border shadow-card p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[16px] font-700 shrink-0">
                  {initials(selectedName)}
                </div>
                <div>
                  <h3 className="text-[16px] font-600 text-foreground">{selectedName}</h3>
                  <p className="text-[12px] font-mono text-muted-foreground">@{selectedUser.username}</p>
                </div>
                <div className="ml-auto grid grid-cols-4 gap-6 text-right">
                  <div>
                    <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Last Active</p>
                    <p className="text-[13px] font-600 text-foreground mt-0.5">{fmtDate(selectedUser.lastActiveAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Sessions</p>
                    <p className="text-[13px] font-600 text-foreground mt-0.5">{selectedUser.lessonsOpened} / {totalSessions}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Completed</p>
                    <p className="text-[13px] font-600 text-foreground mt-0.5">{selectedUser.lessonsCompleted}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Total Time</p>
                    <p className="text-[13px] font-600 text-foreground mt-0.5">{fmtTime(selectedUser.totalTimeSec)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Session timeline */}
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-[14px] font-600 text-foreground">Session Activity Timeline</h3>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info inline-block" /> Opened</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger inline-block" /> Video</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" /> Audio</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Infographic</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Notes</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> Completed</span>
                </div>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Session</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Opened</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Video</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Audio</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Infographic</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Notes</th>
                      <th className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Completed</th>
                      <th
                        className="text-center px-3 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider"
                        title="Watched ≥80% of the video · viewed the infographic full-screen ≥10s · tapped “I finished the quiz”"
                      >
                        Engaged
                      </th>
                      <th className="text-right px-5 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLoading && lessons.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-4"><Skeleton className="h-24 w-full" /></td>
                      </tr>
                    ) : detailError ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-8 text-center text-[12px] text-danger">{detailError}</td>
                      </tr>
                    ) : lessons.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-5 py-8 text-center text-[12px] text-muted-foreground">No sessions yet.</td>
                      </tr>
                    ) : (
                      lessons.map((s) => (
                        <tr key={`timeline-${selectedUser.id}-${s.contentId}`} className={`border-b border-border last:border-0 transition-colors duration-100 ${!s.opened ? 'opacity-40' : 'hover:bg-muted/20'}`}>
                          <td className="px-5 py-3">
                            <p className="text-[12px] font-500 text-foreground">{s.title}</p>
                            {s.opened && (
                              <p className="text-[10px] text-muted-foreground">
                                {s.visits} {s.visits === 1 ? 'visit' : 'visits'} · last {fmtDate(s.lastOpenedAt)}
                                {!s.active && <span className="text-warning"> · hidden</span>}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center"><EventDot active={s.opened} color="bg-info" title={s.opened ? `Last opened ${fmtDate(s.lastOpenedAt, true)}` : 'Not opened'} /></td>
                          <td className="px-3 py-3 text-center"><EventDot active={s.videoPlayed} color="bg-danger" title={`Video watched: ${fmtDuration(s.videoSec)}`} /></td>
                          <td className="px-3 py-3 text-center"><EventDot active={s.audioPlayed} color="bg-warning" title={`Audio listened: ${fmtDuration(s.audioSec)}`} /></td>
                          <td className="px-3 py-3 text-center"><EventDot active={s.infographicViewed} color="bg-accent" title={`Infographic full-screen: ${fmtDuration(s.infographicSec)}`} /></td>
                          <td className="px-3 py-3 text-center"><EventDot active={s.scriptRead} color="bg-violet-500" title={`Lesson notes on screen: ${fmtDuration(s.scriptSec)}`} /></td>
                          <td className="px-3 py-3 text-center"><EventDot active={s.completed} color="bg-success" title={s.completed ? `Completed ${fmtDate(s.completedAt, true)}` : 'Not completed'} /></td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <span title="Watched ≥80% of the video" className={`w-2 h-2 rounded-sm ${s.watchedVideo ? 'bg-danger' : 'bg-muted'}`} />
                              <span title="Viewed the infographic full-screen ≥10s" className={`w-2 h-2 rounded-sm ${s.reviewedInfographic ? 'bg-accent' : 'bg-muted'}`} />
                              <span title="Finished the quiz (self-reported)" className={`w-2 h-2 rounded-sm ${s.quizCompleted ? 'bg-success' : 'bg-muted'}`} />
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-[12px] tabular-nums text-muted-foreground">
                            {s.timeOnPageSec ? fmtTime(s.timeOnPageSec) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent visits */}
            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-[14px] font-600 text-foreground">Recent Visits</h3>
                <span className="text-[11px] text-muted-foreground">Latest {visits.length} · newest first</span>
              </div>
              {detailLoading && visits.length === 0 ? (
                <div className="p-5"><Skeleton className="h-20 w-full" /></div>
              ) : visits.length === 0 ? (
                <p className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                  No lesson visits yet. Activity appears here a few seconds after the patient opens a lesson in the app.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {visits.map((v) => (
                    <li key={`visit-${v.visitId}`} className="px-5 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors duration-100">
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${v.completed ? 'bg-success' : 'bg-info'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[12px] font-600 text-foreground truncate">{v.title}</p>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                            {fmtDate(v.startedAt, true)} · {fmtDuration(v.timeOnPageSec)} on page
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {v.videoPlays > 0 && <VisitChip icon="▶" label={`Video ${fmtDuration(v.videoSec)}`} />}
                          {v.audioPlays > 0 && <VisitChip icon="♪" label={`Audio ${fmtDuration(v.audioSec)}`} />}
                          {v.infographicOpens > 0 && <VisitChip icon="🖼" label={`Infographic ${fmtDuration(v.infographicSec)}`} />}
                          {v.scriptSec > 0 && <VisitChip icon="📝" label={`Notes ${fmtDuration(v.scriptSec)}`} />}
                          {v.quizStarts > 0 && <VisitChip icon="🎮" label={v.quizCompleted ? 'Quiz finished' : 'Quiz started'} />}
                          {v.quizStarts === 0 && v.quizCompleted && <VisitChip icon="🎮" label="Quiz finished" />}
                          {v.completed && <VisitChip icon="✓" label="Marked completed" />}
                          {v.videoPlays + v.audioPlays + v.infographicOpens + v.quizStarts === 0 && v.scriptSec === 0 && !v.completed && !v.quizCompleted && (
                            <span className="text-[11px] text-muted-foreground">Browsed the page</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
