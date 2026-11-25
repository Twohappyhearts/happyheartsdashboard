import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { switchBranch } from '@/lib/server/agent/store';
import { displayMessages } from '@/lib/server/agent/display';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ messageId: z.uuid() });

/**
 * POST /api/agent/conversations/:id/branch { messageId }
 * Show another version of a message (one of its siblingIds): the branch on screen becomes the
 * newest one under it. Returns that branch, as GET …/messages does.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAgentCaller(request);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'Invalid conversation id.');
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new ApiError(400, 'Invalid request.');
    const rows = await switchBranch(caller.admin, caller.userId, id, body.data.messageId);
    return NextResponse.json({ messages: displayMessages(caller, rows) });
  } catch (e) {
    return jsonError(e);
  }
}
