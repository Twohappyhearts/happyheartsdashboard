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
 * Patients get no reasoning parts (the model's thinking is shown only in the staff preview).
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
    const patient = caller.role === 'patient';
    return NextResponse.json({
      messages: rows.map((r) => ({
        ...r.message,
        ...(patient ? { parts: r.message.parts.filter((p) => p.type !== 'reasoning') } : {}),
        seq: r.seq,
        status: r.status,
        createdAt: r.createdAt,
      })),
      nextBefore: rows.length === limit ? rows[0].seq : null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
