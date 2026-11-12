import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/**
 * Users section (dashboard Prompt 6).
 * Reads go through the staff-only RPC staff_list_users; account changes that
 * need the Supabase secret key (create, enable/disable, role, reset password)
 * go through our own server routes under /api/admin/users.
 */

export type AccountRole = 'patient' | 'staff' | 'admin';

/** Role labels are in the staff text (src/lib/i18n/staff, `users.roles`). */

export interface ManagedUser {
  id: string;
  username: string;
  fullName: string;
  displayId: string;
  email: string;
  phone: string;
  role: AccountRole;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  lessonsOpened: number;
  lessonsCompleted: number;
  alertsSent: number;
  openAlerts: number;
}

export class UsersError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export async function listUsers(supabase: SupabaseClient): Promise<ManagedUser[]> {
  const { data, error } = await supabase.rpc('staff_list_accounts');
  if (error) {
    const E = staffText().users.errors;
    if (error.code === '42501') throw new UsersError(E.noPermission);
    if (error.code === 'PGRST202') throw new UsersError(E.runMigration);
    throw new UsersError(error.message || E.load);
  }
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: String(r.user_id),
    username: String(r.username ?? ''),
    fullName: String(r.full_name ?? ''),
    displayId: String(r.display_id ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    role: (r.role as AccountRole) ?? 'patient',
    active: Boolean(r.is_active),
    mustChangePassword: Boolean(r.must_change_password),
    createdAt: String(r.created_at ?? ''),
    lastSignInAt: (r.last_sign_in_at as string | null) ?? null,
    lastActiveAt: (r.last_active_at as string | null) ?? null,
    lessonsOpened: num(r.lessons_opened),
    lessonsCompleted: num(r.lessons_completed),
    alertsSent: num(r.alerts_sent),
    openAlerts: num(r.open_alerts),
  }));
}

async function callApi(url: string, method: string, body: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new UsersError(staffText().common.networkError);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new UsersError(data?.error || staffText().common.requestFailed(res.status), res.status);
  }
}

export interface NewUserInput {
  username: string;
  email: string;
  password: string;
  role: AccountRole;
  displayId: string;
  phone: string;
}

export function createUser(input: NewUserInput) {
  return callApi('/api/admin/users', 'POST', input);
}

export function updateUser(
  id: string,
  changes: { role?: AccountRole; displayId?: string; isActive?: boolean; phone?: string },
) {
  return callApi(`/api/admin/users/${encodeURIComponent(id)}`, 'PATCH', changes);
}

export function resetPassword(id: string, password: string) {
  return callApi(`/api/admin/users/${encodeURIComponent(id)}/password`, 'POST', { password });
}

/** Sends one chat message to each selected active patient; returns how many got it. */
export async function broadcastMessage(
  supabase: SupabaseClient,
  userIds: string[],
  content: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('staff_broadcast', {
    p_user_ids: userIds,
    p_content: content,
  });
  if (error) {
    if (error.code === '42501') throw new UsersError(staffText().users.errors.noPermission);
    throw new UsersError(error.message || staffText().users.errors.broadcast);
  }
  return num(data);
}

// ---------------------------------------------------------------------------
// Validation shared by the Add User and Reset Password forms

export const USERNAME_RE = /^[A-Za-z0-9]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BROADCAST_MAX = 5000;

/** Empty is allowed (optional). Accepts spaces, ( ) - . and a leading +. */
export function phoneProblem(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  const digits = t.replace(/[^0-9]/g, '');
  if (!/^\+?[0-9 ().-]+$/.test(t) || digits.length < 7 || digits.length > 15) {
    return staffText().users.errors.phone;
  }
  return null;
}

/** Stored form: optional leading + and digits only (matches the database). */
export function normalizePhone(phone: string): string {
  const t = phone.trim();
  if (!t) return '';
  return (t.startsWith('+') ? '+' : '') + t.replace(/[^0-9]/g, '');
}

/** "9495550100" -> "(949) 555-0100", "+19495550100" -> "+1 (949) 555-0100". */
export function formatPhone(stored: string): string {
  if (!stored) return '';
  const m10 = stored.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (m10) return `(${m10[1]}) ${m10[2]}-${m10[3]}`;
  const m11 = stored.match(/^\+?1(\d{3})(\d{3})(\d{4})$/);
  if (m11) return `+1 (${m11[1]}) ${m11[2]}-${m11[3]}`;
  return stored;
}

export function passwordProblem(pw: string): string | null {
  const T = staffText().password;
  if (pw.length < 8) return T.tooShort;
  if (pw.length > 72) return T.tooLong;
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return T.needsMix;
  }
  return null;
}

/** 0–4 score for the strength meter. */
export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const s = Math.min(4, pw ? Math.max(1, score - 1) : 0);
  return { score: s, label: staffText().password.strength[s] ?? '' };
}

/** Random temporary password that satisfies the rules (for "Generate"). */
export function generateTempPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const pick = (s: string) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return s[a[0] % s.length];
  };
  const chars = [...sets.map(pick), ...Array.from({ length: 8 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    const j = a[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
