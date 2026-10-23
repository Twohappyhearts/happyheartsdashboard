import 'server-only';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, streamText } from 'ai';

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;
import type { AgentConfig } from './config';

/**
 * The LLM behind the agent.
 *  - dashscope (default): DeepSeek models on Alibaba Cloud Model Studio, OpenAI-compatible API,
 *    same DASHSCOPE_API_KEY as embeddings / rerank.
 *  - deepseek: DeepSeek's own API (DEEPSEEK_API_KEY).
 */
const PROVIDER_NAME = { dashscope: 'dashscope', deepseek: 'deepseek' } as const;

let cached: { key: string; make: (id: string) => LanguageModel } | null = null;

function factory(cfg: AgentConfig) {
  const key = `${cfg.provider}|${cfg.apiKey}|${cfg.baseURL ?? ''}`;
  if (!cached || cached.key !== key) {
    if (cfg.provider === 'deepseek') {
      const p = createDeepSeek({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
      cached = { key, make: (id) => p(id) };
    } else {
      const p = createOpenAICompatible({
        name: PROVIDER_NAME.dashscope,
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        includeUsage: true,
      });
      cached = { key, make: (id) => p.chatModel(id) };
    }
  }
  return cached.make;
}

/** Main chat model (deepseek-v4.1-flash-1017 by default). */
export const chatModel = (cfg: AgentConfig) => factory(cfg)(cfg.model);

/** Model used to write context summaries. */
export const summaryModel = (cfg: AgentConfig) => factory(cfg)(cfg.summaryModel);

/** providerOptions that switch DeepSeek's thinking mode on or off for the configured provider. */
export function thinkingOptions(cfg: AgentConfig, enabled: boolean): ProviderOptions {
  return cfg.provider === 'deepseek'
    ? { deepseek: { thinking: { type: enabled ? 'enabled' : 'disabled' } } }
    : { [PROVIDER_NAME.dashscope]: { enable_thinking: enabled } };
}
