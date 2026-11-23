import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { listAnswerRatings } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/agent/conversations/:id/ratings: the caller's trial ratings in this conversation. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAgentCaller(request);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'Invalid conversation id.');
    return NextResponse.json({ ratings: await listAnswerRatings(caller.admin, caller.userId, id) });
  } catch (e) {
    return jsonError(e);
  }
}
