import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaffCaller, staffJsonError } from '@/lib/server/staff-auth';
import { decodeAnswerCursor, listRatedAnswers, parseRatedAnswerFilters } from '@/lib/server/agent/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ONLY = 'Only active Careteam or Admin accounts can view AI feedback.';

/**
 * GET /api/admin/ai-feedback/answers?range=&language=&model=&usability=&safety=&comment=1&q=&before=
 * Rated answers, newest first, with the counts for the filters (Careteam and Admin). Shows
 * patients' questions, answers and comments: each request is recorded in audit_log.
 */
export async function GET(request: Request) {
  try {
    const caller = await requireStaffCaller(STAFF_ONLY);
    const params = new URL(request.url).searchParams;
    const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 20));
    return NextResponse.json(
      await listRatedAnswers(
        createAdminClient(),
        caller,
        parseRatedAnswerFilters(params),
        decodeAnswerCursor(params.get('before')),
        limit,
      ),
    );
  } catch (e) {
    return staffJsonError(e);
  }
}
