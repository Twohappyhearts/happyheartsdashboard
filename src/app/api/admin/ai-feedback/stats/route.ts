import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaffCaller, staffJsonError } from '@/lib/server/staff-auth';
import { feedbackStats, parseFeedbackFilters } from '@/lib/server/agent/feedback';
import type { FeedbackBucket } from '@/lib/ai-feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ONLY = 'Only active Careteam or Admin accounts can view AI feedback.';

/**
 * GET /api/admin/ai-feedback/stats?range=30d&language=&model=&by=answer|patient&bucket=day|week|month&tz=
 * Every number of Analytics › AI Feedback (aggregates only). Careteam and Admin.
 */
export async function GET(request: Request) {
  try {
    await requireStaffCaller(STAFF_ONLY);
    const params = new URL(request.url).searchParams;
    const stats = await feedbackStats(createAdminClient(), parseFeedbackFilters(params), {
      perPatient: params.get('by') === 'patient',
      bucket: (params.get('bucket') ?? 'day') as FeedbackBucket,
      timeZone: params.get('tz'),
    });
    return NextResponse.json(stats);
  } catch (e) {
    return staffJsonError(e);
  }
}
