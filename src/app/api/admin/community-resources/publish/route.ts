import { after, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, staffJsonError } from '@/lib/server/staff-auth';
import { preparePublish, runPublishJob } from '@/lib/server/community-resources/publish-job';
import { requireResourceStaff } from '../_shared';

export const runtime = 'nodejs';

/**
 * POST /api/admin/community-resources/publish — { hash } from the preview.
 * 202 { runId }: the article is stored, parsed, chunked and embedded in the background, then
 * replaces the previous one. 409 if the directory changed since the preview or another run is going.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireResourceStaff();
    const body = (await request.json().catch(() => null)) as { hash?: unknown } | null;
    const hash = typeof body?.hash === 'string' ? body.hash : '';
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new ApiError(400, 'Invalid request.');
    const admin = createAdminClient();
    const { runId, article } = await preparePublish(admin, hash, caller.userId);
    after(() => runPublishJob(admin, runId, article, caller.userId));
    return NextResponse.json({ runId }, { status: 202 });
  } catch (e) {
    return staffJsonError(e);
  }
}
