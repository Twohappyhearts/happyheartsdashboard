import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/**
 * Dashboard Analytics, read through staff-only Postgres functions
 * (supabase/migrations/20261021000100_tracking_analytics.sql). All numbers are
 * derived on the fly from the append-only public.tracking_events log that the
 * mobile app writes; nothing here writes data.
 */

export class AnalyticsError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

function fail(e: { code?: string; message?: string } | null, fallback: string): AnalyticsError {
  if (!e) return new AnalyticsError(fallback);
  const E = staffText().analytics.errors;
  if (e.code === '42501') return new AnalyticsError(E.noPermission, e.code);
  if (e.code === 'PGRST202' || e.code === '42883') {
    return new AnalyticsError(E.missing, e.code);
  }
  return new AnalyticsError(e.message || fallback, e.code);
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

// ---------------------------------------------------------------------------
// Overall

export interface OverviewStats {
  sessionOpens: number;
  uniqueViewers: number;
  avgTimeSec: number;
  totalTimeSec: number;
  completions: number;
  completionRate: number; // 0..100
  videoPlays: number;
  audioPlays: number;
  infographicOpens: number;
  scriptReads: number;
  quizCompletions: number;
}

type Row = Record<string, unknown>;

function toOverview(r: Row | undefined): OverviewStats {
  return {
    sessionOpens: num(r?.session_opens),
    uniqueViewers: num(r?.unique_viewers),
    avgTimeSec: num(r?.avg_time_s),
    totalTimeSec: num(r?.total_time_s),
    completions: num(r?.completions),
    completionRate: num(r?.completion_rate),
    videoPlays: num(r?.video_plays),
    audioPlays: num(r?.audio_plays),
    infographicOpens: num(r?.infographic_opens),
    scriptReads: num(r?.script_reads),
    quizCompletions: num(r?.quiz_completions),
  };
}

/** Stats for [from, to); omit both for all time. */
export async function getOverview(supabase: SupabaseClient, from?: Date, to?: Date): Promise<OverviewStats> {
  const { data, error } = await supabase.rpc('analytics_overview', {
    p_from: from ? from.toISOString() : null,
    p_to: to ? to.toISOString() : null,
  });
  if (error) throw fail(error, staffText().analytics.errors.load);
  return toOverview((data as Row[] | null)?.[0]);
}

export interface WeeklyPoint {
  weekStart: string; // YYYY-MM-DD (Monday)
  opens: number;
  completions: number;
}

export async function getWeekly(supabase: SupabaseClient, weeks = 8): Promise<WeeklyPoint[]> {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  const { data, error } = await supabase.rpc('analytics_weekly', { p_weeks: weeks, p_tz: tz });
  if (error) throw fail(error, staffText().analytics.errors.weekly);
  return ((data as Row[] | null) ?? []).map((r) => ({
    weekStart: String(r.week_start),
    opens: num(r.opens),
    completions: num(r.completions),
  }));
}

export interface ContentPerformance {
  id: string;
  title: string;
  groupId: string;
  category: string | null;
  active: boolean;
  videoDurationSec: number | null;
  opens: number;
  uniqueViewers: number;
  avgTimeSec: number;
  totalTimeSec: number;
  videoTaps: number;
  videoSec: number;
  audioTaps: number;
  audioSec: number;
  infographicOpens: number;
  avgInfographicSec: number;
  scriptReads: number;
  scriptSec: number;
  quizTaps: number;
  quizCompletions: number;
  completions: number;
  completionRate: number;
}

export async function getContentPerformance(supabase: SupabaseClient): Promise<ContentPerformance[]> {
  const { data, error } = await supabase.rpc('analytics_content_performance', { p_from: null, p_to: null });
  if (error) throw fail(error, staffText().analytics.errors.content);
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: String(r.content_id),
    title: String(r.title ?? ''),
    groupId: String(r.group_id ?? ''),
    category: (r.category as string | null) ?? null,
    active: Boolean(r.is_active),
    videoDurationSec: r.video_duration_s == null ? null : num(r.video_duration_s),
    opens: num(r.opens),
    uniqueViewers: num(r.unique_viewers),
    avgTimeSec: num(r.avg_time_s),
    totalTimeSec: num(r.total_time_s),
    videoTaps: num(r.video_plays),
    videoSec: num(r.video_s),
    audioTaps: num(r.audio_plays),
    audioSec: num(r.audio_s),
    infographicOpens: num(r.infographic_opens),
    avgInfographicSec: num(r.avg_infographic_s),
    scriptReads: num(r.script_reads),
    scriptSec: num(r.script_s),
    quizTaps: num(r.quiz_starts),
    quizCompletions: num(r.quiz_completions),
    completions: num(r.completions),
    completionRate: num(r.completion_rate),
  }));
}

// ---------------------------------------------------------------------------
// Individual

export interface PatientSummary {
  id: string;
  fullName: string;
  username: string;
  displayId: string | null;
  active: boolean;
  lastActiveAt: string | null;
  lessonsOpened: number;
  lessonsCompleted: number;
  visits: number;
  totalTimeSec: number;
}

export async function listPatients(supabase: SupabaseClient): Promise<PatientSummary[]> {
  const { data, error } = await supabase.rpc('analytics_patients');
  if (error) throw fail(error, staffText().analytics.errors.patients);
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: String(r.user_id),
    fullName: String(r.full_name ?? ''),
    username: String(r.username ?? ''),
    displayId: (r.display_id as string | null) ?? null,
    active: Boolean(r.is_active),
    lastActiveAt: (r.last_active_at as string | null) ?? null,
    lessonsOpened: num(r.lessons_opened),
    lessonsCompleted: num(r.lessons_completed),
    visits: num(r.visits),
    totalTimeSec: num(r.total_time_s),
  }));
}

export interface PatientLesson {
  contentId: string;
  title: string;
  groupId: string;
  active: boolean;
  opened: boolean;
  visits: number;
  videoPlayed: boolean;
  audioPlayed: boolean;
  infographicViewed: boolean;
  scriptRead: boolean;
  quizStarted: boolean;
  quizCompleted: boolean;
  completed: boolean;
  watchedVideo: boolean;
  reviewedInfographic: boolean;
  timeOnPageSec: number;
  videoSec: number;
  audioSec: number;
  infographicSec: number;
  scriptSec: number;
  lastOpenedAt: string | null;
  completedAt: string | null;
}

export async function getPatientLessons(supabase: SupabaseClient, userId: string): Promise<PatientLesson[]> {
  const { data, error } = await supabase.rpc('analytics_patient_lessons', { p_user_id: userId });
  if (error) throw fail(error, staffText().analytics.errors.lessons);
  return ((data as Row[] | null) ?? []).map((r) => ({
    contentId: String(r.content_id),
    title: String(r.title ?? ''),
    groupId: String(r.group_id ?? ''),
    active: Boolean(r.is_active),
    opened: Boolean(r.opened),
    visits: num(r.visits),
    videoPlayed: Boolean(r.video_played),
    audioPlayed: Boolean(r.audio_played),
    infographicViewed: Boolean(r.infographic_viewed),
    scriptRead: Boolean(r.script_read),
    quizStarted: Boolean(r.quiz_started),
    quizCompleted: Boolean(r.quiz_completed),
    completed: Boolean(r.completed),
    watchedVideo: Boolean(r.watched_video),
    reviewedInfographic: Boolean(r.reviewed_infographic),
    timeOnPageSec: num(r.time_on_page_s),
    videoSec: num(r.video_s),
    audioSec: num(r.audio_s),
    infographicSec: num(r.infographic_s),
    scriptSec: num(r.script_s),
    lastOpenedAt: (r.last_opened_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
  }));
}

export interface PatientVisit {
  visitId: string;
  contentId: string | null;
  title: string;
  startedAt: string;
  lastEventAt: string;
  timeOnPageSec: number;
  videoPlays: number;
  videoSec: number;
  audioPlays: number;
  audioSec: number;
  infographicOpens: number;
  infographicSec: number;
  scriptSec: number;
  quizStarts: number;
  quizCompleted: boolean;
  completed: boolean;
}

export async function getPatientVisits(supabase: SupabaseClient, userId: string, limit = 30): Promise<PatientVisit[]> {
  const { data, error } = await supabase.rpc('analytics_patient_visits', { p_user_id: userId, p_limit: limit });
  if (error) throw fail(error, staffText().analytics.errors.visits);
  return ((data as Row[] | null) ?? []).map((r) => ({
    visitId: String(r.visit_id),
    contentId: (r.content_id as string | null) ?? null,
    title: String(r.title ?? staffText().analytics.errors.deletedLesson),
    startedAt: String(r.started_at),
    lastEventAt: String(r.last_event_at),
    timeOnPageSec: num(r.time_on_page_s),
    videoPlays: num(r.video_plays),
    videoSec: num(r.video_s),
    audioPlays: num(r.audio_plays),
    audioSec: num(r.audio_s),
    infographicOpens: num(r.infographic_opens),
    infographicSec: num(r.infographic_s),
    scriptSec: num(r.script_s),
    quizStarts: num(r.quiz_starts),
    quizCompleted: Boolean(r.quiz_completed),
    completed: Boolean(r.completed),
  }));
}

/** Number of lessons patients can currently see (for "3 / 4 sessions"). */
export async function countActiveSessions(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'session')
    .eq('is_active', true);
  if (error) throw fail(error, staffText().analytics.errors.count);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Formatting + CSV

/** 0 -> "0s", 75 -> "1m 15s", 3900 -> "1h 5m". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Spreadsheet formula injection guard.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
