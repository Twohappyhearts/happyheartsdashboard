import { getToolName, isToolUIPart, type UIMessage } from 'ai';

/**
 * How big a context is. The unit is configurable (AGENT_CONTEXT_UNIT) because we
 * haven't decided yet: plain character count, or a rough token estimate.
 *
 * The token estimate needs no tokenizer: CJK characters count ~1 token each,
 * everything else ~4 characters per token. Swap `estimateTokens` for a real
 * tokenizer later without touching the callers.
 */
export type SizeUnit = 'chars' | 'tokens';

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;

export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.ceil(cjk + (text.length - cjk) / 4);
}

export function measureText(text: string, unit: SizeUnit): number {
  return unit === 'chars' ? text.length : estimateTokens(text);
}

const json = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

/** The text a message contributes to the model context (roughly what gets serialized). */
export function messageText(message: UIMessage): string {
  const out: string[] = [];
  for (const part of message.parts) {
    if (part.type === 'text' || part.type === 'reasoning') out.push(part.text);
    else if (isToolUIPart(part)) {
      out.push(getToolName(part), json(part.input), json(part.output ?? part.errorText));
    }
  }
  return out.join('\n');
}

export function measureMessages(messages: UIMessage[], unit: SizeUnit): number {
  return messages.reduce((n, m) => n + measureText(messageText(m), unit), 0);
}
