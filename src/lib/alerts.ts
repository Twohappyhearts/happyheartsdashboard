import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/**
 * Staff side of "I need assistance" requests (public.assistance_requests).
 * Patients create them from the mobile app; staff move them
 * NEW -> ACK -> RESOLVED. Staff notes live in assistance_request_notes,
 * which only staff can read (RLS).
 */

export type AlertStatus = 'NEW' | 'ACK' | 'RESOLVED';
export type AlertFilter = 'open' | 'new' | 'ack' | 'resolved' | 'all';

/**
 * Filter tabs, in order. Staff-facing words (status and filter labels) are in the staff text
 * (src/lib/i18n/staff, section `alerts`): the stored status stays 'ACK'; staff see it as "Seen"
 * ("ACK" was unclear to people outside the team).
 */
export const ALERT_FILTERS: AlertFilter[] = ['open', 'new', 'ack', 'resolved', 'all'];

export interface AssistanceAlert {
  id: string;
  patientId: string;
  patientName: string;
  username: string;
  message: string;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notes: string;
  notesUpdatedAt: string | null;
  notesUpdatedBy: string | null;
}

export interface AlertCounts {
  new: number;
  ack: number;
  resolvedToday: number;
}

export class AlertError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

const BASE_COLUMNS =
  'id, patient_id, message, status, created_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by, ' +
  'note:assistance_request_notes(notes, updated_at, updated_by), ';
const SELECT = BASE_COLUMNS + 'patient:profiles(id, full_name, username)';
// !inner: rows whose participant doesn't match the search are dropped.
const SELECT_FILTER_PATIENT = BASE_COLUMNS + 'patient:profiles!inner(id, full_name, username)';

export interface AlertSearch {
  /** Part of the participant's name or username (case-insensitive). */
  participant?: string;
  /** Local calendar dates, YYYY-MM-DD, inclusive. Filter on Occurred. */
  from?: string;
  to?: string;
}

/** Strip characters that have meaning in PostgREST filter syntax. */
function cleanTerm(raw: string): string {
  return raw.replace(/^@+/, '').replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** YYYY-MM-DD (local) -> ISO timestamp of local midnight; days = 1 for the day after. */
function localDayStart(date: string, addDays = 0): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Row = Record<string, unknown>;
const one = (v: unknown): Row | null => (Array.isArray(v) ? (v[0] as Row) ?? null : (v as Row) ?? null);

function toAlert(r: Row): AssistanceAlert {
  const p = one(r.patient);
  const n = one(r.note);
  const fullName = ((p?.full_name as string) ?? '').trim();
  const username = (p?.username as string) ?? '';
  const status = r.status === 'ACK' || r.status === 'RESOLVED' ? (r.status as AlertStatus) : 'NEW';
  return {
    id: String(r.id),
    patientId: String(r.patient_id),
    patientName: fullName || (username ? `@${username}` : staffText().alerts.errors.unknownParticipant),
    username,
    message: String(r.message ?? ''),
    status,
    createdAt: String(r.created_at),
    acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
    acknowledgedBy: (r.acknowledged_by as string | null) ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    resolvedBy: (r.resolved_by as string | null) ?? null,
    notes: (n?.notes as string) ?? '',
    notesUpdatedAt: (n?.updated_at as string | null) ?? null,
    notesUpdatedBy: (n?.updated_by as string | null) ?? null,
  };
}

function fail(e: { code?: string; message?: string } | null, fallback: string): AlertError {
  if (e?.code === '42501') return new AlertError(staffText().common.noStaffPermission, e.code);
  if (e?.code === '23514') return new AlertError(staffText().alerts.errors.notesTooLong, e.code);
  return new AlertError(`${fallback}${e?.message ? `: ${e.message}` : ''}`, e?.code);
}

export async function listAlerts(
  supabase: SupabaseClient,
  filter: AlertFilter,
  search: AlertSearch = {},
  limit = 500
): Promise<AssistanceAlert[]> {
  const term = cleanTerm(search.participant ?? '');
  let q = supabase.from('assistance_requests').select(term ? SELECT_FILTER_PATIENT : SELECT);
  if (term) {
    q = q.or(`full_name.ilike.*${term}*,username.ilike.*${term}*`, { referencedTable: 'patient' });
  }
  const fromIso = search.from ? localDayStart(search.from) : null;
  const toIso = search.to ? localDayStart(search.to, 1) : null;
  if (fromIso) q = q.gte('created_at', fromIso);
  if (toIso) q = q.lt('created_at', toIso);

  if (filter === 'open') q = q.in('status', ['NEW', 'ACK']);
  else if (filter === 'new') q = q.eq('status', 'NEW');
  else if (filter === 'ack') q = q.eq('status', 'ACK');
  else if (filter === 'resolved') q = q.eq('status', 'RESOLVED');

  const ordered =
    filter === 'resolved'
      ? q.order('resolved_at', { ascending: false, nullsFirst: false })
      : q.order('created_at', { ascending: false });
  const { data, error } = await ordered.order('id', { ascending: false }).limit(limit);
  if (error) throw fail(error, staffText().alerts.errors.load);
  return ((data ?? []) as unknown as Row[]).map(toAlert);
}

export async function getAlert(supabase: SupabaseClient, id: string): Promise<AssistanceAlert | null> {
  const { data, error } = await supabase.from('assistance_requests').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw fail(error, staffText().alerts.errors.loadOne);
  return data ? toAlert(data as unknown as Row) : null;
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getAlertCounts(supabase: SupabaseClient): Promise<AlertCounts> {
  const head = () => supabase.from('assistance_requests').select('id', { count: 'exact', head: true });
  const [n, a, r] = await Promise.all([
    head().eq('status', 'NEW'),
    head().eq('status', 'ACK'),
    head().eq('status', 'RESOLVED').gte('resolved_at', startOfToday()),
  ]);
  const err = n.error ?? a.error ?? r.error;
  if (err) throw fail(err, staffText().alerts.errors.counts);
  return { new: n.count ?? 0, ack: a.count ?? 0, resolvedToday: r.count ?? 0 };
}

/** Who/when fields are filled in by the database trigger. */
export async function setAlertStatus(supabase: SupabaseClient, id: string, status: AlertStatus): Promise<void> {
  const { error } = await supabase.from('assistance_requests').update({ status }).eq('id', id);
  if (error) throw fail(error, staffText().alerts.errors.update);
}

/**
 * Update-then-insert (not upsert): staff may only UPDATE the notes column, and
 * an upsert would also try to update request_id.
 */
export async function saveAlertNotes(supabase: SupabaseClient, id: string, notes: string): Promise<void> {
  const { data, error } = await supabase
    .from('assistance_request_notes')
    .update({ notes })
    .eq('request_id', id)
    .select('request_id');
  if (error) throw fail(error, staffText().alerts.errors.saveNotes);
  if (data && data.length > 0) return;

  const ins = await supabase.from('assistance_request_notes').insert({ request_id: id, notes });
  if (!ins.error) return;
  if (ins.error.code === '23505') {
    // Another staff member created the row first; apply ours on top.
    const again = await supabase.from('assistance_request_notes').update({ notes }).eq('request_id', id);
    if (!again.error) return;
    throw fail(again.error, staffText().alerts.errors.saveNotes);
  }
  throw fail(ins.error, staffText().alerts.errors.saveNotes);
}
