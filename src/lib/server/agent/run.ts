import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  getToolName,
  isStepCount,
  isToolUIPart,
  streamText,
  type UIMessage,
} from 'ai';
import { FIXED_REPLIES, type CareteamSituation } from '@/lib/agent-fixed-replies';
import { ApiError } from '@/lib/server/staff-auth';
import { applyApprovals, type ApprovalAnswer } from './approval';
import type { AgentCaller } from './auth';
import { agentConfig, type AgentConfig } from './config';
import { buildContext, summarize } from './context';
import { chatModel, thinkingOptions } from './model';
import {
  claimApprovalMessage,
  createConversation,
  expirePendingApprovals,
  getConversation,
  hasPendingApproval,
  insertUserMessage,
  loadState,
  saveAssistantMessage,
  type AgentState,
  type Conversation,
  type MessageStatus,
} from './store';
import { AgentToolError, createAgentTools, SEARCH_TOOL, TOOLS_NEEDING_APPROVAL } from './tools';
import { generateConversationTitle } from './title';

export type AgentRequest =
  | { kind: 'message'; conversationId?: string; text: string }
  | { kind: 'approval'; conversationId: string; approvals: ApprovalAnswer[] };

const needsApproval = new Set<string>(TOOLS_NEEDING_APPROVAL);

/** Each search is an embedding + hybrid search + rerank plus another model step; cap them per turn. */
const MAX_SEARCHES_PER_TURN = 2;
const lastUserId = (messages: UIMessage[]) => [...messages].reverse().find((m) => m.role === 'user')?.id ?? null;

/** Spanish wording of the rule 2 reply (the prompt quotes it word for word). */
const PERSONAL_REPLY_ES = 'Por favor, comuníquese con su proveedor de atención médica.';
const squash = (t: string) => t.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').toLowerCase();

/** Which fixed reply (rule 1a / 1b / 2) the text contains, if any. Longer replies first. */
export function fixedReplySituation(text: string): CareteamSituation | null {
  const t = squash(text);
  const order: CareteamSituation[] = ['crisis_other', 'crisis', 'urgent', 'personal'];
  for (const situation of order) if (t.includes(squash(FIXED_REPLIES[situation]))) return situation;
  return t.includes(squash(PERSONAL_REPLY_ES)) ? 'personal' : null;
}

/**
 * Situations whose care-team offer the user turned down (pressed Cancel) earlier in the
 * conversation. The prompt tells the model not to offer again for the same concern, so the
 * forced follow-up must not offer it either. An offer that lapsed unanswered does not count.
 */
export function declinedCareteamSituations(messages: UIMessage[]): Set<string> {
  const declined = new Set<string>();
  for (const m of messages) {
    for (const p of m.parts) {
      if (!isToolUIPart(p) || getToolName(p) !== 'notifyCareteam') continue;
      const cancelled = p.state === 'output-denied' || (p.state === 'approval-responded' && !p.approval.approved);
      const situation = (p.input as { situation?: unknown } | undefined)?.situation;
      if (cancelled && typeof situation === 'string') declined.add(situation);
    }
  }
  return declined;
}

/**
 * One agent turn:
 *   1. restore state (summary + state + messages after the summary)
 *   2. add the user's message, or write the user's approval answers into the waiting tool call
 *   3. build instructions + context, trimming / summarizing when over the thresholds
 *   4. streamText: model ↔ tools loop (AI SDK), pausing at tools that need approval
 *   5. onEnd: save the assistant message (full parts), then compress in the background if needed
 */
export async function runAgentTurn(caller: AgentCaller, req: AgentRequest): Promise<Response> {
  const cfg = agentConfig();
  // Filled in when the patient edited a care-team message in the confirmation.
  const careteamEdits = new Map<string, string>();
  const tools = createAgentTools(caller, { careteamEdits });
  const opts = { canNotifyCareteam: true };
  const { admin } = caller;

  let conversation: Conversation;
  let durationBefore = 0;
  /** Set only for a brand-new conversation: its title, being generated alongside the reply. */
  let titlePromise: Promise<string> | null = null;

  // ---- 1 + 2
  if (req.kind === 'message') {
    if (req.conversationId) {
      conversation = await getConversation(admin, caller.userId, req.conversationId);
    } else {
      conversation = await createConversation(admin, caller.userId, null);
      // Starts now and runs alongside the reply; sent to the client at the end of the stream.
      titlePromise = generateConversationTitle(admin, conversation, req.text, cfg);
    }
    // A new message instead of an answer: the old approval request lapses.
    await expirePendingApprovals(admin, conversation);
    await insertUserMessage(admin, conversation, {
      id: randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: req.text }],
    });
  } else {
    const before = await loadState(admin, caller.userId, req.conversationId);
    conversation = before.conversation;
    const { target, message, stillPending, careteamEdits: edits } = applyApprovals(before.recent, req.approvals);
    edits.forEach((text, toolCallId) => careteamEdits.set(toolCallId, text));
    const claimed = await claimApprovalMessage(admin, conversation, target.message.id, message.parts, stillPending);
    if (!claimed) throw new ApiError(409, 'This request was already answered.');
    if (stillPending) {
      // Several tool calls were waiting; continue once all are answered.
      return NextResponse.json({ conversationId: conversation.id, status: 'awaiting_approval' }, { status: 202 });
    }
    durationBefore = target.durationMs ?? 0;
  }

  // ---- 3
  let state = await loadState(admin, caller.userId, conversation.id);
  let built = buildContext(state, cfg, opts);
  if (built.needsSummary) {
    try {
      if (await summarize(admin, state, cfg)) {
        state = await loadState(admin, caller.userId, conversation.id);
        built = buildContext(state, cfg, opts);
      }
    } catch (e) {
      console.warn('[agent] summary failed, continuing with the trimmed context', e);
    }
  }
  conversation = state.conversation;
  const original = state.recent.map((s) => s.message);
  const replyTo = lastUserId(original);

  const modelMessages = await convertToModelMessages(built.messages, { tools, ignoreIncompleteToolCalls: true });

  // ---- 4
  const started = Date.now();
  let stepStarted = started;
  const toolNames = Object.keys(tools) as Array<keyof typeof tools>;
  const result = streamText({
    model: chatModel(cfg),
    instructions: built.instructions,
    messages: modelMessages,
    tools,
    toolApproval: ({ toolCall }) => (needsApproval.has(toolCall.toolName) ? 'user-approval' : undefined),
    experimental_toolApprovalSecret: cfg.toolApprovalSecret,
    stopWhen: isStepCount(cfg.maxSteps),
    providerOptions: thinkingOptions(cfg, cfg.thinking),
    // After MAX_SEARCHES_PER_TURN searches the model must answer with what it has.
    prepareStep: ({ steps }) => {
      const searches = steps.reduce((n, st) => n + st.toolCalls.filter((c) => c.toolName === SEARCH_TOOL).length, 0);
      return searches >= MAX_SEARCHES_PER_TURN ? { activeTools: toolNames.filter((n) => n !== SEARCH_TOOL) } : {};
    },
    onStepEnd: (step) => {
      const now = Date.now();
      const calls = step.toolCalls.map((c) => c.toolName).join(',') || '-';
      console.info(`[agent] ${conversation.id.slice(0, 8)} step ${step.stepNumber}: ${now - stepStarted}ms tools=${calls}`);
      stepStarted = now;
    },
  });

  // Keep generating (and saving) even if the phone drops the connection.
  void result.consumeStream({ onError: (e) => console.error('[agent] stream error', e) });

  // ---- 5
  // One SSE stream: the agent's output, then (new conversations only) the generated title.
  const titleFor = titlePromise;
  const conversationId = conversation.id;
  const stream = createUIMessageStream({
    originalMessages: original,
    // One id for the reply, injected into the stream's start event (a continuation keeps the old id).
    generateId: randomUUID,
    execute: async ({ writer }) => {
      writer.merge(result.toUIMessageStream({ sendReasoning: true, sendFinish: false, onError: streamError }));
      // Every emergency reply (rule 1) comes with an offer to message the care team (the user still
      // has to press Send). If the model wrote the fixed reply but made no offer, ask for the offer
      // in one more, forced call; its tool call joins the same reply message.
      // Rule 2 answers now carry general information and the referral sentence can appear in
      // ordinary answers too, so a missing offer is only forced for emergencies.
      // Not when the user already cancelled an offer for the same kind of situation.
      const found = opts.canNotifyCareteam ? await missingCareteamOffer(result) : null;
      const missing = found === 'personal' ? null : found;
      const situation = missing && !declinedCareteamSituations(original).has(missing) ? missing : null;
      if (missing && !situation) console.info(`[agent] ${conversationId.slice(0, 8)} no care-team offer: the user cancelled one for "${missing}" earlier`);
      if (situation) {
        console.info(`[agent] ${conversationId.slice(0, 8)} care-team offer missing after a "${situation}" reply; asking for it`);
        const followUp = streamText({
          model: chatModel(cfg),
          instructions: `${built.instructions}\n\nYou just gave the fixed reply for this situation: "${situation}". Now call notifyCareteam with situation "${situation}" and a draft in the user's words. Write no other text.`,
          messages: [...modelMessages, ...(await result.responseMessages)],
          tools,
          activeTools: ['notifyCareteam'],
          toolChoice: { type: 'tool', toolName: 'notifyCareteam' },
          toolApproval: ({ toolCall }) => (needsApproval.has(toolCall.toolName) ? 'user-approval' : undefined),
          experimental_toolApprovalSecret: cfg.toolApprovalSecret,
          stopWhen: isStepCount(1),
          providerOptions: thinkingOptions(cfg, false),
        });
        void followUp.consumeStream({ onError: (e) => console.error('[agent] care-team follow-up stream error', e) });
        writer.merge(followUp.toUIMessageStream({ sendStart: false, onError: streamError }));
      } else {
        writer.write({ type: 'finish' });
      }
      if (titleFor) {
        const title = await titleFor; // usually long done by now; never longer than TITLE_TIMEOUT_MS
        // transient: delivered to the client only, never stored in the message parts.
        writer.write({ type: 'data-conversation-title', data: { conversationId, title }, transient: true });
      }
    },
    onError: streamError,
    onEnd: async ({ responseMessage, isAborted, outcome }) => {
      // A reply with no content is never "NORMAL" (it would hide a lost answer).
      const empty = !responseMessage.parts.some((p) => p.type !== 'step-start');
      const status: MessageStatus =
        outcome.status === 'failed'
          ? 'ERROR'
          : isAborted || outcome.status === 'aborted'
            ? 'INTERRUPTED'
            : hasPendingApproval(responseMessage)
              ? 'AWAITING_APPROVAL'
              : empty
                ? 'ERROR'
                : 'NORMAL';
      let usage: unknown;
      try {
        usage = await result.totalUsage;
      } catch {
        usage = undefined;
      }
      try {
        await saveAssistantMessage(admin, conversation, responseMessage, {
          status,
          replyTo,
          durationMs: durationBefore + (Date.now() - started),
          model: cfg.model,
          usage,
        });
      } catch (e) {
        console.error('[agent] failed to save the assistant message', e);
        return;
      }
      void compressAfterTurn(caller, conversationId, cfg, opts);
    },
  });

  // One copy goes to the phone; the other is read here to the end, so the reply is
  // completed and saved (onEnd) even if the phone disconnects or the user switches away.
  const [toClient, toServer] = stream.tee();
  void drain(toServer);

  return createUIMessageStreamResponse({
    stream: toClient,
    headers: { 'X-Conversation-Id': conversationId, 'X-Context-Level': built.level },
  });
}

async function drain(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  try {
    while (!(await reader.read()).done) {
      // discard: the client copy carries the data
    }
  } catch (e) {
    console.warn('[agent] stream ended with an error', e);
  }
}

function streamError(e: unknown) {
  // Tool failures we raised ourselves carry a message that is safe to show (and tells the model what happened).
  const toolError = e instanceof AgentToolError ? e : e instanceof Error && e.cause instanceof AgentToolError ? e.cause : null;
  if (toolError) return toolError.message;
  console.error('[agent] error', e);
  return 'The assistant ran into a problem. Please try again.';
}

/** After a turn, summarize now so the next request does not pay for it. */
async function compressAfterTurn(caller: AgentCaller, conversationId: string, cfg: AgentConfig, opts: { canNotifyCareteam: boolean }) {
  try {
    const state: AgentState = await loadState(caller.admin, caller.userId, conversationId);
    if (buildContext(state, cfg, opts).needsSummary) await summarize(caller.admin, state, cfg);
  } catch (e) {
    console.warn('[agent] background summary failed', e);
  }
}

/**
 * The situation of a fixed reply that came without a care-team offer, or null
 * (no fixed reply, an offer was made, or the turn failed).
 */
async function missingCareteamOffer(result: { steps: PromiseLike<Array<{ text: string; toolCalls: Array<{ toolName: string }> }>> }) {
  try {
    const steps = await result.steps;
    if (steps.some((st) => st.toolCalls.some((c) => c.toolName === 'notifyCareteam'))) return null;
    return fixedReplySituation(steps.map((st) => st.text).join('\n'));
  } catch {
    return null;
  }
}
