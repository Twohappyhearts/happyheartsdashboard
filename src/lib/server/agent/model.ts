import 'server-only';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, streamText } from 'ai';

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;
import type { AgentConfig } from './config';

/**
 * The LLM behind the agent.
 *  - openai (default): OpenAI Responses API (OPENAI_API_KEY).
 *  - dashscope: DeepSeek models on Alibaba Cloud Model Studio, OpenAI-compatible API,
 *    same DASHSCOPE_API_KEY as embeddings / rerank.
 *  - deepseek: DeepSeek's own API (DEEPSEEK_API_KEY).
 */
const PROVIDER_NAME = { dashscope: 'dashscope', deepseek: 'deepseek' } as const;

let cached: { key: string; make: (id: string) => LanguageModel; openai?: ReturnType<typeof createOpenAI> } | null = null;

function factory(cfg: AgentConfig) {
  const key = `${cfg.provider}|${cfg.apiKey}|${cfg.baseURL ?? ''}`;
  if (!cached || cached.key !== key) {
    if (cfg.provider === 'openai') {
      const p = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
      cached = { key, make: (id) => p.responses(id), openai: p };
    } else if (cfg.provider === 'deepseek') {
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

/** The OpenAI provider (for its built-in tools such as web search); null for other providers. */
export function openaiProvider(cfg: AgentConfig) {
  factory(cfg);
  return cached?.openai ?? null;
}

/** Main chat model (AGENT_MODEL, or the provider's default in config.ts). */
export const chatModel = (cfg: AgentConfig) => factory(cfg)(cfg.model);

/** Model used to write context summaries. */
export const summaryModel = (cfg: AgentConfig) => factory(cfg)(cfg.summaryModel);

/** Any model of the configured provider, by id. */
export const modelById = (cfg: AgentConfig, id: string) => factory(cfg)(id);

/** providerOptions that turn the model's thinking up or down (OpenAI reasoning effort, DeepSeek thinking mode). */
export function thinkingOptions(cfg: AgentConfig, enabled: boolean): ProviderOptions {
  if (cfg.provider === 'openai') return { openai: { reasoningEffort: enabled ? 'medium' : 'low' } };
  return cfg.provider === 'deepseek'
    ? { deepseek: { thinking: { type: enabled ? 'enabled' : 'disabled' } } }
    : { [PROVIDER_NAME.dashscope]: { enable_thinking: enabled } };
}
