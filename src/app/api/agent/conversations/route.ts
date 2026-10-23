import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { listConversations } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/agent/conversations — the caller's AI conversations, newest first. */
export async function GET(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    return NextResponse.json({ conversations: await listConversations(caller.admin, caller.userId) });
  } catch (e) {
    return jsonError(e);
  }
}
