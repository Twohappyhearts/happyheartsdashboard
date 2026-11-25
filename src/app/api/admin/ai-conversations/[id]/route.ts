import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, requireStaffCaller, staffJsonError } from '@/lib/server/staff-auth';
import { openReviewConversation } from '@/lib/server/agent/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ONLY = 'Only active Careteam or Admin accounts can view AI conversations.';

/**
 * GET /api/admin/ai-conversations/:id?version=
 * One AI conversation (anyone's), read-only (Careteam and Admin): the branch its owner has on
 * screen, or with `version` (a message of the conversation) the newest branch under it.
 * Each call is recorded in audit_log.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireStaffCaller(STAFF_ONLY);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'Invalid request.');
    const version = new URL(request.url).searchParams.get('version');
    if (version && !z.uuid().safeParse(version).success) throw new ApiError(400, 'Invalid request.');
    return NextResponse.json(await openReviewConversation(createAdminClient(), caller, id, version || null));
  } catch (e) {
    return staffJsonError(e);
  }
}
