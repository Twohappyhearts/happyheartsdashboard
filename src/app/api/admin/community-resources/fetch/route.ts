import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, staffJsonError } from '@/lib/server/staff-auth';
import { prepareFetchRun, runFetchJob } from '@/lib/server/community-resources/fetch-job';
import { summarizer } from '@/lib/server/community-resources/summarize';
import { requireResourceStaff } from '../_shared';

export const runtime = 'nodejs';

/**
 * POST /api/admin/community-resources/fetch — start "Update from websites".
 * 202 { runId, total } and the run continues in the background (the page polls
 * community_resource_runs); 200 { runId: null, total: 0 } when nothing needs a check;
 * 409 while another run is going.
 */
export async function POST() {
  try {
    const caller = await requireResourceStaff();
    let s;
    try {
      s = summarizer();
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'The AI agent is not configured.');
    }
    const admin = createAdminClient();
    const { runId, targets } = await prepareFetchRun(admin, caller.userId);
    if (!runId) return NextResponse.json({ runId: null, total: 0 });
    after(() => runFetchJob(admin, runId, targets, s));
    return NextResponse.json({ runId, total: targets.length }, { status: 202 });
  } catch (e) {
    return staffJsonError(e);
  }
}
