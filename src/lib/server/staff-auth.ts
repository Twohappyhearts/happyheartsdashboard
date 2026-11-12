import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStaffLang } from '@/lib/i18n/staff/server';
import { translateServerMessage } from '@/lib/i18n/staff/server-messages';

export type AccountRole = 'patient' | 'staff' | 'admin';

export interface StaffCaller {
  userId: string;
  role: 'staff' | 'admin';
}

/** Error with an HTTP status that route handlers turn into a JSON response. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonError(e: unknown, translate: (message: string) => string = (m) => m) {
  if (e instanceof ApiError) return NextResponse.json({ error: translate(e.message) }, { status: e.status });
  console.error('[admin api]', e);
  return NextResponse.json({ error: translate('Something went wrong. Please try again.') }, { status: 500 });
}

/**
 * jsonError for the dashboard's own routes (src/app/api/admin/*): the message is in the staff
 * dashboard language (hh_staff_lang cookie). The agent routes, which the patient chat also
 * calls, keep jsonError.
 */
export async function staffJsonError(e: unknown) {
  const lang = await getStaffLang();
  return jsonError(e, (m) => translateServerMessage(m, lang));
}

/**
 * The signed-in dashboard user, verified on the server (JWT checked by
 * Supabase, role read with the admin client). Throws 401/403 otherwise.
 * `forbidden` is the 403 message (the default suits the user-management routes).
 */
export async function requireStaffCaller(
  forbidden = 'Only active Careteam or Admin accounts can manage users.'
): Promise<StaffCaller> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'Please sign in again.');

  const admin = createAdminClient();
  const { data: row, error: roleErr } = await admin
    .from('account_roles')
    .select('role, is_active')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (roleErr) throw roleErr;
  if (!row || !row.is_active || (row.role !== 'staff' && row.role !== 'admin')) {
    throw new ApiError(403, forbidden);
  }
  return { userId: data.user.id, role: row.role };
}

/** Like requireStaffCaller, but only an active Admin passes (same rule as is_active_admin() in the database). */
export async function requireAdminCaller(forbidden = 'Only an active Admin account can do this.'): Promise<StaffCaller> {
  const caller = await requireStaffCaller(forbidden);
  if (caller.role !== 'admin') throw new ApiError(403, forbidden);
  return caller;
}

export const USERNAME_RE = /^[A-Za-z0-9]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ROLES: AccountRole[] = ['patient', 'staff', 'admin'];

/** Same rules as the dashboard form (min 8, upper, lower, digit). */
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password needs an uppercase letter, a lowercase letter, and a number.';
  }
  return null;
}

/**
 * Optional phone. Returns the stored form (optional "+" then digits, e.g.
 * "9495550100"), null for empty, or throws 400.
 */
export function cleanPhone(phone: unknown): string | null {
  const t = String(phone ?? '').trim();
  if (!t) return null;
  const digits = t.replace(/[^0-9]/g, '');
  if (!/^\+?[0-9 ().-]+$/.test(t) || digits.length < 7 || digits.length > 15) {
    throw new ApiError(400, 'Enter a valid phone number.');
  }
  return (t.startsWith('+') ? '+' : '') + digits;
}

/**
 * Careteam (staff) accounts create and manage Patient accounts only; Admins manage every account.
 * Pass every role involved: the account's current role and, for a role change, the new one.
 */
export function assertCanManageRole(caller: StaffCaller, ...roles: (AccountRole | null | undefined)[]) {
  if (caller.role !== 'admin' && roles.some((r) => r != null && r !== 'patient')) {
    throw new ApiError(403, 'Only an Admin can manage Careteam and Admin accounts.');
  }
}
