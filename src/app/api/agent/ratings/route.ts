import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { saveAnswerRating } from '@/lib/server/agent/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Only the fields present are changed: a score is saved as soon as it is picked (null clears it),
 * and the comment is saved on its own. At least one field must be sent.
 */
const Body = z
  .object({
    messageId: z.uuid(),
    usability: z.number().int().min(1).max(5).nullable().optional(),
    safety: z.number().int().min(1).max(3).nullable().optional(),
    comment: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.usability !== undefined || b.safety !== undefined || b.comment !== undefined, {
    message: 'Nothing to change.',
  });

/**
 * POST /api/agent/ratings: change the caller's trial rating of one AI answer.
 * Returns { rating } as saved, or { rating: null } when both scores are now empty (the rating
 * was deleted).
 */
export async function POST(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new ApiError(400, 'Invalid rating.');
    const rating = await saveAnswerRating(caller.admin, caller.userId, body.data);
    return NextResponse.json({ rating });
  } catch (e) {
    return jsonError(e);
  }
}
