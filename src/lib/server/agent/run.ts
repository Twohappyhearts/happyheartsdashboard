import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
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
  parentForNewMessage,
  insertUserMessage,
  loadState,
  saveAssistantMessage,
  type AgentState,
  type Conversation,
  type MessageStatus,
} from './store';
import { AgentToolError, createAgentTools, SEARCH_TOOL, TOOLS_NEEDING_APPROVAL, WEB_TOOL } from './tools';
import { withWebDomains } from './web-domains';
import { createWebSearch } from './websearch';
import { generateConversationTitle } from './title';
import type { InstructionOptions } from './prompt';

export type AgentRequest =
  /** `editOf`: the user message this one replaces (a new version of it, on a new branch). */
  | { kind: 'message'; conversationId?: string; text: string; editOf?: string }
  | { kind: 'approval'; conversationId: string; approvals: ApprovalAnswer[] };

const needsApproval = new Set<string>(TOOLS_NEEDING_APPROVAL);

/** Each search is an embedding + hybrid search + rerank plus another model step; cap them per turn. */
const MAX_SEARCHES_PER_TURN = 2;
/** Each web search is a separate OpenAI request with the built-in search; same cap. */
const MAX_WEB_SEARCHES_PER_TURN = 2;
const lastUserId = (messages: UIMessage[]) => [...messages].reverse().find((m) => m.role === 'user')?.id ?? null;

/**
 * One agent turn:
 *   1. restore state (summary + state + messages after the summary)
 *   2. add the user's message, or write the user's approval answers into the waiting tool call
 *   3. build instructions + context, trimming / summarizing when over the thresholds
 *   4. streamText: model ↔ tools loop (AI SDK), pausing at tools that need approval
 *   5. onEnd: save the assistant message (full parts), then compress in the background if needed
 */
export async function runAgentTurn(caller: AgentCaller, req: AgentRequest): Promise<Response> {
  // The sites web search may use are the ones staff set in the dashboard (Trusted Websites).
  const cfg = await withWebDomains(agentConfig(), caller.admin);
  const searchWeb = createWebSearch(cfg);
  const tools = createAgentTools(caller, { searchWeb, webSites: cfg.webSearch?.domains });
  const opts: InstructionOptions = { canSearchWeb: searchWeb != null };
  const { admin } = caller;

  let conversation: Conversation;
  let durationBefore = 0;
  /** Set only for a brand-new conversation: its title, being generated alongside the reply. */
  let titlePromise: Promise<string> | null = null;
  /** The user message this turn answers (sent to the client, which only had a local id for it). */
  let userMessageId: string | null = null;

  // ---- 1 + 2
  if (req.kind === 'message') {
    if (req.conversationId) {
      conversation = await getConversation(admin, caller.userId, req.conversationId);
    } else {
      if (req.editOf) throw new ApiError(400, 'Editing needs the conversation.');
      conversation = await createConversation(admin, caller.userId, null);
      // Starts now and runs alongside the reply; sent to the client at the end of the stream.
      titlePromise = generateConversationTitle(admin, conversation, req.text, cfg);
    }
    // A new message instead of an answer: the old approval request lapses.
    await expirePendingApprovals(admin, conversation);
    const parentId = await parentForNewMessage(admin, conversation, req.editOf);
    userMessageId = randomUUID();
    await insertUserMessage(
      admin,
      conversation,
      { id: userMessageId, role: 'user', parts: [{ type: 'text', text: req.text }] },
      parentId,
    );
  } else {
    const before = await loadState(admin, caller.userId, req.conversationId);
    conversation = before.conversation;
    const { target, message, stillPending } = applyApprovals(before.recent, req.approvals);
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
    // After the cap for a search tool the model must answer with what it has.
    prepareStep: ({ steps }) => {
      const count = (name: string) => steps.reduce((n, st) => n + st.toolCalls.filter((c) => c.toolName === name).length, 0);
      const spent = new Set<string>();
      if (count(SEARCH_TOOL) >= MAX_SEARCHES_PER_TURN) spent.add(SEARCH_TOOL);
      if (count(WEB_TOOL) >= MAX_WEB_SEARCHES_PER_TURN) spent.add(WEB_TOOL);
      return spent.size ? { activeTools: toolNames.filter((n) => !spent.has(n)) } : {};
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
      writer.write({ type: 'finish' });
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
    // Patients never receive the model's reasoning; staff see it in the dashboard preview.
    stream: caller.role === 'patient' ? toClient.pipeThrough(withoutReasoning()) : toClient,
    headers: {
      'X-Conversation-Id': conversationId,
      ...(userMessageId ? { 'X-User-Message-Id': userMessageId } : {}),
      'X-Context-Level': built.level,
      // no-transform: `next start` gzips every response it can, and gzip holds the stream back
      // until a large block is full, so a reply arrived in a few bursts instead of word by word.
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

const REASONING_CHUNKS = new Set<string>(['reasoning-start', 'reasoning-delta', 'reasoning-end', 'reasoning-file']);

/**
 * Drops reasoning from the copy sent to a patient. The stream itself keeps sendReasoning on, so
 * the saved message keeps its reasoning parts and an approval answer continues the turn with
 * the same context as before; the history route strips them for patients as well.
 */
function withoutReasoning() {
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (!REASONING_CHUNKS.has(chunk.type)) controller.enqueue(chunk);
    },
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
async function compressAfterTurn(
  caller: AgentCaller,
  conversationId: string,
  cfg: AgentConfig,
  opts: InstructionOptions,
) {
  try {
    const state: AgentState = await loadState(caller.admin, caller.userId, conversationId);
    if (buildContext(state, cfg, opts).needsSummary) await summarize(caller.admin, state, cfg);
  } catch (e) {
    console.warn('[agent] background summary failed', e);
  }
}
