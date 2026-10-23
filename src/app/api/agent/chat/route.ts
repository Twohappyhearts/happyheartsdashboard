import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { runAgentTurn } from '@/lib/server/agent/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1).max(4000),
  }),
  z.object({
    conversationId: z.uuid(),
    approvals: z
      .array(
        z.object({
          approvalId: z.string().min(1).max(200),
          approved: z.boolean(),
          reason: z.string().max(500).optional(),
          // notifyCareteam: the patient's edited message (replaces the AI's draft when sent).
          editedMessage: z.string().trim().min(1).max(1000).optional(),
        }),
      )
      .min(1)
      .max(10),
  }),
]);

/**
 * POST /api/agent/chat — one agent turn, streamed as an AI SDK UI message stream (SSE).
 *
 *   New message:     { conversationId?, message }            (no conversationId = new conversation)
 *   Approve/deny:    { conversationId, approvals: [{ approvalId, approved, reason?, editedMessage? }] }
 *
 * Auth: `Authorization: Bearer <Supabase access token>` (mobile app) or the dashboard session cookie.
 * The response header X-Conversation-Id carries the conversation id.
 * 202 JSON { status: 'awaiting_approval' } when other tool calls in the same message still wait for an answer.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, 'Invalid request.');
    const body = parsed.data;
    return await runAgentTurn(
      caller,
      'message' in body
        ? { kind: 'message', conversationId: body.conversationId, text: body.message }
        : { kind: 'approval', conversationId: body.conversationId, approvals: body.approvals },
    );
  } catch (e) {
    return jsonError(e);
  }
}
