import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ApiError,
  assertCanManageRole,
  staffJsonError,
  passwordProblem,
  requireStaffCaller,
  type AccountRole,
} from '@/lib/server/staff-auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/users/:id/password — Reset Password (Edit User dialog).
 * Body: { password } — a new temporary password; the user must change it at
 * their next sign-in.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid user id.');
    if (id === caller.userId) {
      throw new ApiError(400, 'Change your own password from your account, not here.');
    }
    const body = await request.json().catch(() => null);
    const problem = passwordProblem(body?.password);
    if (problem) throw new ApiError(400, problem);

    const admin = createAdminClient();
    const { data: row, error: rowErr } = await admin
      .from('account_roles')
      .select('role')
      .eq('user_id', id)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) throw new ApiError(404, 'User not found.');
    assertCanManageRole(caller, row.role as AccountRole);

    const { error } = await admin.auth.admin.updateUserById(id, { password: body.password as string });
    if (error) throw new ApiError(400, `Could not reset the password: ${error.message}`);
    const { error: flagErr } = await admin
      .from('account_roles')
      .update({ must_change_password: true })
      .eq('user_id', id);
    if (flagErr) throw flagErr;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return staffJsonError(e);
  }
}
