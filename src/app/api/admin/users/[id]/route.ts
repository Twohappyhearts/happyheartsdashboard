import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ApiError,
  ROLES,
  assertCanManageRole,
  cleanPhone,
  staffJsonError,
  requireStaffCaller,
  type AccountRole,
} from '@/lib/server/staff-auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ~100 years: Supabase's way to block sign-in until the ban is lifted. */
const BAN_FOREVER = '876000h';

/**
 * PATCH /api/admin/users/:id — Edit User / Enable-Disable.
 * Body (all optional): { role, displayId, isActive, phone }
 * Disabling keeps all data, blocks sign-in (auth ban) and RLS access
 * (account_roles.is_active=false). Usernames never change (REDCap code).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid user id.');
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid request.');

    const admin = createAdminClient();
    const { data: current, error: curErr } = await admin
      .from('account_roles')
      .select('role, is_active')
      .eq('user_id', id)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current) throw new ApiError(404, 'User not found.');
    // Careteam accounts may change Patient accounts only, in any way; Admins any account.
    assertCanManageRole(caller, current.role as AccountRole);

    const roleUpdate: { role?: AccountRole; is_active?: boolean } = {};
    if (body.role !== undefined) {
      const role = String(body.role) as AccountRole;
      if (!ROLES.includes(role)) throw new ApiError(400, 'Choose a valid role.');
      if (role !== current.role) {
        if (id === caller.userId) throw new ApiError(400, 'You cannot change your own role.');
        assertCanManageRole(caller, current.role as AccountRole, role);
        roleUpdate.role = role;
      }
    }
    if (body.isActive !== undefined) {
      const isActive = Boolean(body.isActive);
      if (isActive !== current.is_active) {
        if (id === caller.userId) throw new ApiError(400, 'You cannot disable your own account.');
        roleUpdate.is_active = isActive;
      }
    }

    let displayId: string | null | undefined;
    if (body.displayId !== undefined) {
      const d = String(body.displayId ?? '').trim();
      if (d.length > 50) throw new ApiError(400, 'Display ID must be 50 characters or fewer.');
      displayId = d || null;
    }

    const profileUpdate: { display_id?: string | null; phone?: string | null } = {};
    if (displayId !== undefined) profileUpdate.display_id = displayId;
    if (body.phone !== undefined) profileUpdate.phone = cleanPhone(body.phone);

    if (roleUpdate.is_active !== undefined) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: roleUpdate.is_active ? 'none' : BAN_FOREVER,
      });
      if (error) throw new ApiError(400, `Could not update sign-in access: ${error.message}`);
    }
    if (Object.keys(roleUpdate).length > 0) {
      const { error } = await admin.from('account_roles').update(roleUpdate).eq('user_id', id);
      if (error) throw error;
    }
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await admin.from('profiles').update(profileUpdate).eq('id', id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return staffJsonError(e);
  }
}
