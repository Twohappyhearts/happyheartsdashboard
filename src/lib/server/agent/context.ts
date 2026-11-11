import 'server-only';
import { generateText, getToolName, isToolUIPart, type UIMessage } from 'ai';
import type { AgentConfig } from './config';
import { measureMessages, measureText } from './measure';
import { summaryModel, thinkingOptions } from './model';
import { buildInstructions, fixedReplyTableText, type InstructionOptions } from './prompt';
import { saveSummary, type AgentState, type StoredMessage } from './store';
import { RESULT_TOOLS, SEARCH_TOOL, type SearchToolOutput } from './tools';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Builds what the model sees from the stored state, compressing in two levels:
 *
 *   size < trimAt × budget (50%)          → send as is
 *   size ≥ trimAt × budget                → shorten searchKnowledge outputs older than `ragKeepTurns`
 *   still ≥ summarizeAt × budget (80%)    → LLM summary of everything but the last `keepRecentTurns`
 *
 * Trimming only changes the request; the database keeps the full parts.
 * A summary is persisted (agent_conversations.summary / summarized_until_seq).
 *
 * The table of translated fixed replies in the instructions does not count toward the budget:
 * it is the same in every request, and counting it would shrink the room left for the conversation.
 */

export type CompressionLevel = 'none' | 'trimmed' | 'summarized';

export interface BuiltContext {
  instructions: string;
  /** UI messages to convert for the model (trimmed copy). */
  messages: UIMessage[];
  size: number;
  budget: number;
  level: CompressionLevel;
}

/** A turn = one user message and everything after it, up to the next user message. */
export function splitTurns<T extends { message: UIMessage }>(items: T[]): T[][] {
  const turns: T[][] = [];
  for (const item of items) {
    if (item.message.role === 'user' || turns.length === 0) turns.push([item]);
    else turns[turns.length - 1].push(item);
  }
  return turns;
}

/** Earlier turns' reasoning is never needed by the model; the current turn keeps it (tool loops). */
function dropOldReasoning(messages: UIMessage[]): UIMessage[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  return messages.map((m, i) =>
    i < lastUser && m.role === 'assistant' ? { ...m, parts: m.parts.filter((p) => p.type !== 'reasoning') } : m,
  );
}

function trimSearchOutput(output: SearchToolOutput, chars: number): SearchToolOutput {
  if (output.trimmed) return output;
  return {
    results: (output.results ?? []).map((r) => ({
      ...r,
      content: r.content.length > chars ? `${r.content.slice(0, chars)}…` : r.content,
    })),
    trimmed: true,
    note: 'Older search results were shortened. Search again if the full text is needed.',
  };
}

/** Shorten RAG outputs in all but the last `keepTurns` turns. */
function trimRagResults(messages: UIMessage[], keepTurns: number, chars: number): UIMessage[] {
  const turns = splitTurns(messages.map((message) => ({ message })));
  const cut = Math.max(0, turns.length - keepTurns);
  return turns.flatMap((turn, t) =>
    t >= cut
      ? turn.map((x) => x.message)
      : turn.map(({ message }) => ({
          ...message,
          parts: message.parts.map((p) =>
            isToolUIPart(p) && RESULT_TOOLS.has(getToolName(p)) && p.state === 'output-available'
              ? { ...p, output: trimSearchOutput(p.output as SearchToolOutput, chars) }
              : p,
          ),
        })),
  );
}

const exempt = new Map<string, number>();
/** Size of the fixed-reply table (constant, so measured once per unit). */
function exemptSize(unit: AgentConfig['contextUnit']): number {
  let n = exempt.get(unit);
  if (n == null) exempt.set(unit, (n = measureText(fixedReplyTableText(), unit)));
  return n;
}

export function buildContext(
  state: AgentState,
  cfg: AgentConfig,
  opts: InstructionOptions,
  /** Override messages (e.g. with an approval answer applied). Defaults to state.recent. */
  messages: UIMessage[] = state.recent.map((s) => s.message),
): BuiltContext & { needsSummary: boolean } {
  const instructions = buildInstructions(state.conversation, opts);
  const budget = cfg.contextBudget;
  const instructionSize = Math.max(0, measureText(instructions, cfg.contextUnit) - exemptSize(cfg.contextUnit));
  const sizeOf = (msgs: UIMessage[]) => instructionSize + measureMessages(msgs, cfg.contextUnit);

  let msgs = dropOldReasoning(messages);
  let size = sizeOf(msgs);
  let level: CompressionLevel = 'none';

  if (size >= cfg.trimAt * budget) {
    msgs = trimRagResults(msgs, cfg.ragKeepTurns, cfg.ragTrimChars);
    size = sizeOf(msgs);
    level = 'trimmed';
  }
  return { instructions, messages: msgs, size, budget, level, needsSummary: size >= cfg.summarizeAt * budget };
}

// ---------------------------------------------------------------- summary

const MAX_MESSAGE_CHARS = 4000;

/** Text transcript for the summarizer: no reasoning, no RAG passages (they can be searched again). */
function transcript(items: StoredMessage[]): string {
  return items
    .map(({ message }) => {
      const bits: string[] = [];
      for (const p of message.parts) {
        if (p.type === 'text' && p.text.trim()) bits.push(p.text.trim());
        else if (isToolUIPart(p)) {
          const name = getToolName(p);
          const input = JSON.stringify(p.input ?? {});
          const result =
            p.state === 'output-denied' || (p.state === 'approval-responded' && !p.approval.approved)
              ? 'denied by the patient'
              : p.state === 'output-error'
                ? `failed: ${p.errorText}`
                : name === SEARCH_TOOL
                  ? 'searched the knowledge base'
                  : RESULT_TOOLS.has(name)
                    ? 'searched trusted websites'
                  : p.state === 'output-available'
                    ? JSON.stringify(p.output)
                    : p.state;
          bits.push(`[tool ${name} ${input} → ${result}]`);
        }
      }
      const text = bits.join('\n').slice(0, MAX_MESSAGE_CHARS);
      return text ? `${message.role === 'user' ? 'Patient' : 'Assistant'}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

const SUMMARY_INSTRUCTIONS = [
  'You compress a conversation between a patient and the HappyHearts health-education assistant.',
  'Write a concise summary the assistant can rely on to continue the conversation. Keep:',
  "- facts the patient shared about themselves (symptoms, situation, preferences, concerns) — exactly as they said them, no guesses;",
  '- questions asked and the key answers given (include the source material titles that were cited);',
  '- actions taken (e.g. messages sent to the care team, and whether the patient approved or declined them);',
  '- open questions or anything the assistant promised to follow up on.',
  'Do not add medical advice or interpretation. Use bullet points. Write in the language of the conversation. Max ~300 words.',
].join('\n');

/**
 * Summarize every turn except the last `keepRecentTurns` into the stored summary.
 * Returns true if a new summary was saved.
 */
export async function summarize(admin: SupabaseClient, state: AgentState, cfg: AgentConfig): Promise<boolean> {
  const turns = splitTurns(state.recent);
  const keep = Math.max(1, cfg.keepRecentTurns);
  if (turns.length <= keep) return false;

  const old = turns.slice(0, turns.length - keep).flat();
  // Never summarize past a message that still waits for an approval.
  if (old.some((s) => s.status === 'AWAITING_APPROVAL')) return false;
  const untilSeq = old[old.length - 1].seq;

  const previous = state.conversation.summary?.trim();
  const prompt = [
    previous ? `Existing summary of the earlier part:\n${previous}\n` : '',
    `Conversation to add to the summary:\n${transcript(old)}`,
    '',
    previous ? 'Write the updated summary covering both.' : 'Write the summary.',
  ].join('\n');

  const { text } = await generateText({
    model: summaryModel(cfg),
    instructions: SUMMARY_INSTRUCTIONS,
    prompt,
    maxOutputTokens: 1200,
    providerOptions: thinkingOptions(cfg, false),
  });
  const summary = text.trim();
  if (!summary) return false;
  return saveSummary(admin, state.conversation, summary, untilSeq);
}
