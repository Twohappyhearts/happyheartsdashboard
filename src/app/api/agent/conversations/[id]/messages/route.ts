import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { displayMessages } from '@/lib/server/agent/display';
import { listMessages } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/conversations/:id/messages?limit=100
 * The branch on screen (first message → current leaf), its last `limit` messages in order: UI
 * messages (parts incl. tool calls and approval state) with their versions (siblingIds).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAgentCaller(request);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'Invalid conversation id.');
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 100));
    const rows = await listMessages(caller.admin, caller.userId, id, limit);
    return NextResponse.json({ messages: displayMessages(caller, rows), nextBefore: null });
  } catch (e) {
    return jsonError(e);
  }
}
