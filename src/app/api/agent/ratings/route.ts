import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { saveAnswerRating } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  messageId: z.uuid(),
  usability: z.number().int().min(1).max(5),
  safety: z.number().int().min(1).max(3),
  comment: z.string().trim().max(300).default(''),
});

/** POST /api/agent/ratings: save the caller's trial rating of one AI answer. */
export async function POST(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new ApiError(400, 'Invalid rating.');
    await saveAnswerRating(caller.admin, caller.userId, body.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
