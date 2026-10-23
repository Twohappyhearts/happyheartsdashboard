import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import type { AgentConfig } from './config';
import { summaryModel, thinkingOptions } from './model';
import { setConversationTitle, type Conversation } from './store';

const MAX_TITLE_CHARS = 60;

/**
 * The SSE stream stays open until the title is sent, so the title call gets at
 * most this long. If the model is slower (or fails), the start of the first
 * message is used instead — the stream is never held open waiting on it.
 */
export const TITLE_TIMEOUT_MS = 5000;

const TITLE_INSTRUCTIONS = [
  'Write a short title for a conversation that starts with the message below.',
  'Rules: same language as the message; at most 6 words (or 15 Chinese characters); name the topic, not the person;',
  'no quotes, no ending punctuation, no emoji; leave out names and other personal details. Reply with the title only.',
].join('\n');

function clean(text: string): string {
  return text
    .split('\n')[0]
    .replace(/^(title|标题)\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’「」《》\s]+|["'“”‘’「」《》\s。.!！?？]+$/g, '')
    .slice(0, MAX_TITLE_CHARS)
    .trim();
}

const fallback = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
};

/**
 * Give a new conversation a title from its first message: LLM-generated, or the
 * start of the message if that takes longer than TITLE_TIMEOUT_MS or fails.
 * Saves it, then resolves with it (never rejects).
 */
export async function generateConversationTitle(
  admin: SupabaseClient,
  conversation: Conversation,
  firstMessage: string,
  cfg: AgentConfig,
): Promise<string> {
  let title = '';
  try {
    const { text } = await generateText({
      model: summaryModel(cfg),
      instructions: TITLE_INSTRUCTIONS,
      prompt: firstMessage.slice(0, 2000),
      maxOutputTokens: 40,
      providerOptions: thinkingOptions(cfg, false),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    });
    title = clean(text);
  } catch (e) {
    console.warn('[agent] title generation failed or timed out, using the first message', e instanceof Error ? e.message : e);
  }
  title = title || fallback(firstMessage);
  try {
    await setConversationTitle(admin, conversation, title);
  } catch (e) {
    console.warn('[agent] could not save the conversation title', e);
  }
  return title;
}
