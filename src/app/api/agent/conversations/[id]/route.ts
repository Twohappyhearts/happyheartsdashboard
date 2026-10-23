import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { deleteConversation } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DELETE /api/agent/conversations/:id — delete one of the caller's conversations (soft delete). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireAgentCaller(request);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, 'Invalid conversation id.');
    await deleteConversation(caller.admin, caller.userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
