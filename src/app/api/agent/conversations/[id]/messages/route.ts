import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { listMessages } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent/conversations/:id/messages?before=<seq>&limit=50
 * Full history for display: UI messages (parts incl. tool calls and approval state) in order.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAgentCaller(request);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'Invalid conversation id.');
    const url = new URL(request.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const rows = await listMessages(caller.admin, caller.userId, id, before ? Number(before) : undefined, limit);
    return NextResponse.json({
      messages: rows.map((r) => ({ ...r.message, seq: r.seq, status: r.status, createdAt: r.createdAt })),
      nextBefore: rows.length === limit ? rows[0].seq : null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
