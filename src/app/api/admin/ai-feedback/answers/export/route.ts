import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaffCaller, staffJsonError } from '@/lib/server/staff-auth';
import { exportRatedAnswers, parseRatedAnswerFilters } from '@/lib/server/agent/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ONLY = 'Only active Careteam or Admin accounts can view AI feedback.';

/**
 * GET /api/admin/ai-feedback/answers/export?<same filters as the list>
 * Every matching rated answer as CSV (participant IDs, no names). Recorded in audit_log.
 */
export async function GET(request: Request) {
  try {
    const caller = await requireStaffCaller(STAFF_ONLY);
    const csv = await exportRatedAnswers(createAdminClient(), caller, parseRatedAnswerFilters(new URL(request.url).searchParams));
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ai-rated-answers-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return staffJsonError(e);
  }
}
