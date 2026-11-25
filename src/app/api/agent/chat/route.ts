import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { assertConsent } from '@/lib/server/agent/consent';
import { runAgentTurn } from '@/lib/server/agent/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1).max(4000),
    // Edit: the user message this one replaces (a new version of it, on a new branch).
    editOf: z.uuid().optional(),
  }),
  z.object({
    conversationId: z.uuid(),
    approvals: z
      .array(
        z.object({
          approvalId: z.string().min(1).max(200),
          approved: z.boolean(),
          reason: z.string().max(500).optional(),
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
 *   Edit a message:  { conversationId, message, editOf }     (a new version of user message editOf)
 *   Approve/deny:    { conversationId, approvals: [{ approvalId, approved, reason? }] }
 *
 * Auth: `Authorization: Bearer <Supabase access token>` (mobile app) or the dashboard session cookie.
 * 403 for a patient who has not accepted the AI assistant notice yet (POST /api/agent/consent).
 * The response headers X-Conversation-Id and X-User-Message-Id carry the conversation id and the
 * id the server gave the user's message.
 * 202 JSON { status: 'awaiting_approval' } when other tool calls in the same message still wait for an answer.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    // Patients accept the AI notice once before their first message (403 until then).
    await assertConsent(caller);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, 'Invalid request.');
    const body = parsed.data;
    return await runAgentTurn(
      caller,
      'message' in body
        ? { kind: 'message', conversationId: body.conversationId, text: body.message, editOf: body.editOf }
        : { kind: 'approval', conversationId: body.conversationId, approvals: body.approvals },
    );
  } catch (e) {
    return jsonError(e);
  }
}
