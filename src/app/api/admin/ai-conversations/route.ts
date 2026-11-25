import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaffCaller, staffJsonError } from '@/lib/server/staff-auth';
import { REVIEW_ROLES, decodeCursor, listReviewConversations, type ReviewRole } from '@/lib/server/agent/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ONLY = 'Only active Careteam or Admin accounts can view AI conversations.';

/**
 * GET /api/admin/ai-conversations?q=&role=&before=
 * Everyone's AI assistant conversations, newest activity first (Careteam and Admin). `q` matches
 * the title or the owner's name, username or display ID; `role` keeps one role (patient, staff,
 * admin); `before` is the `next` of the page before.
 */
export async function GET(request: Request) {
  try {
    await requireStaffCaller(STAFF_ONLY);
    const params = new URL(request.url).searchParams;
    const search = (params.get('q') ?? '').trim().slice(0, 100);
    const before = decodeCursor(params.get('before'));
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 30));
    const roleParam = params.get('role');
    const role = REVIEW_ROLES.includes(roleParam as ReviewRole) ? (roleParam as ReviewRole) : null;
    return NextResponse.json(await listReviewConversations(createAdminClient(), { search, role, before, limit }));
  } catch (e) {
    return staffJsonError(e);
  }
}
