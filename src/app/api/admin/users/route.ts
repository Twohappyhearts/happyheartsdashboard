import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ApiError,
  EMAIL_RE,
  ROLES,
  USERNAME_RE,
  assertCanManageRole,
  cleanPhone,
  staffJsonError,
  passwordProblem,
  requireStaffCaller,
  type AccountRole,
} from '@/lib/server/staff-auth';

/**
 * POST /api/admin/users — create an account (Users > Add User).
 * Body: { username, email, password, role, displayId?, phone? }
 * The login is created with the secret key, then admin_provision_account sets
 * the username / role / display ID and the must-change-password flag. The
 * user must change the temporary password at first sign-in.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireStaffCaller();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid request.');

    const username = String(body.username ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = body.password;
    const role = String(body.role ?? 'patient') as AccountRole;
    const displayId = String(body.displayId ?? '').trim();
    const phone = cleanPhone(body.phone);

    if (!USERNAME_RE.test(username)) throw new ApiError(400, 'Username must be 3–20 letters or numbers.');
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, 'Enter a valid email address.');
    const pwProblem = passwordProblem(password);
    if (pwProblem) throw new ApiError(400, pwProblem);
    if (!ROLES.includes(role)) throw new ApiError(400, 'Choose a valid role.');
    if (displayId.length > 50) throw new ApiError(400, 'Display ID must be 50 characters or fewer.');
    assertCanManageRole(caller, role);

    const admin = createAdminClient();
    const { data: taken, error: takenErr } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username.replace(/[%_\\]/g, '\\$&'))
      .limit(1);
    if (takenErr) throw takenErr;
    if (taken && taken.length > 0) throw new ApiError(409, `The username “${username}” is already taken.`);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: password as string,
      email_confirm: true,
      app_metadata: {
        username,
        account_role: role,
        display_id: displayId || null,
        must_change_password: true,
      },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') && (msg.includes('registered') || msg.includes('exists'))) {
        throw new ApiError(409, 'An account with this email already exists.');
      }
      if (msg.includes('password')) throw new ApiError(400, error.message);
      throw new ApiError(400, `Could not create the account: ${error.message}`);
    }
    // GoTrue writes app_metadata after the insert trigger runs, so apply the
    // staff-chosen username / role / display ID (+ temp-password flag) now.
    const { error: provErr } = await admin.rpc('admin_provision_account', {
      p_user_id: data.user.id,
      p_username: username,
      p_role: role,
      p_display_id: displayId || null,
    });
    if (provErr) {
      // Roll back the half-created login so the form can simply be retried.
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      if (provErr.code === '23505') throw new ApiError(409, `The username “${username}” is already taken.`);
      throw new ApiError(400, `Could not finish creating the account: ${provErr.message}`);
    }
    if (phone) {
      const { error: phoneErr } = await admin.from('profiles').update({ phone }).eq('id', data.user.id);
      if (phoneErr) console.error('[admin api] could not save phone', phoneErr);
    }
    return NextResponse.json({ id: data.user.id }, { status: 201 });
  } catch (e) {
    return staffJsonError(e);
  }
}
