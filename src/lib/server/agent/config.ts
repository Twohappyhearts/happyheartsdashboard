import 'server-only';
import type { SizeUnit } from './measure';

/**
 * Agent settings from environment variables (see .env.example).
 *
 * Context compression thresholds are fractions of `contextBudget`:
 *   >= trimAt     (50%) → shorten old searchKnowledge (RAG) results
 *   >= summarizeAt (80%) → LLM summary of older turns, keep the last `keepRecentTurns`
 */
export type AgentProvider = 'openai' | 'dashscope' | 'deepseek';

export interface AgentConfig {
  provider: AgentProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  summaryModel: string;
  thinking: boolean;
  maxSteps: number;
  contextUnit: SizeUnit;
  contextBudget: number;
  trimAt: number;
  summarizeAt: number;
  keepRecentTurns: number;
  ragKeepTurns: number;
  ragTrimChars: number;
  toolApprovalSecret?: string;
}

const API_KEY_VAR: Record<AgentProvider, string> = {
  openai: 'OPENAI_API_KEY',
  dashscope: 'DASHSCOPE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};
const BASE_URL_VAR: Record<AgentProvider, string> = {
  openai: 'OPENAI_BASE_URL',
  dashscope: 'DASHSCOPE_BASE_URL',
  deepseek: 'DEEPSEEK_BASE_URL',
};
const DEFAULT_MODEL: Record<AgentProvider, string> = {
  openai: 'gpt-6-luna',
  dashscope: 'deepseek-v4.1-flash-1017',
  deepseek: 'deepseek-v4.1-flash-1017',
};

const int = (name: string, d: number, min: number) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return d;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be a whole number >= ${min}.`);
  return n;
};

const ratio = (name: string, d: number) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return d;
  const n = Number(raw);
  if (!(n > 0 && n <= 1)) throw new Error(`${name} must be a number in (0, 1].`);
  return n;
};

export function agentConfig(): AgentConfig {
  const provider = (process.env.AGENT_PROVIDER || 'openai') as AgentProvider;
  if (!(provider in API_KEY_VAR)) throw new Error('AGENT_PROVIDER must be "openai", "dashscope" or "deepseek".');
  const apiKey = process.env[API_KEY_VAR[provider]];
  if (!apiKey) throw new Error(`The AI agent is not configured (${API_KEY_VAR[provider]} missing on the server).`);
  const baseURL = process.env.AGENT_BASE_URL || process.env[BASE_URL_VAR[provider]] || undefined;

  const unit = (process.env.AGENT_CONTEXT_UNIT || 'chars') as SizeUnit;
  if (unit !== 'chars' && unit !== 'tokens') throw new Error('AGENT_CONTEXT_UNIT must be "chars" or "tokens".');

  const trimAt = ratio('AGENT_TRIM_AT', 0.5);
  const summarizeAt = ratio('AGENT_SUMMARIZE_AT', 0.8);
  if (trimAt >= summarizeAt) throw new Error('AGENT_TRIM_AT must be lower than AGENT_SUMMARIZE_AT.');

  const model = process.env.AGENT_MODEL || DEFAULT_MODEL[provider];
  return {
    provider,
    apiKey,
    baseURL,
    model,
    summaryModel: process.env.AGENT_SUMMARY_MODEL || model,
    thinking: (process.env.AGENT_THINKING || 'enabled') !== 'disabled',
    maxSteps: int('AGENT_MAX_STEPS', 5, 1),
    contextUnit: unit,
    // Our own compression budget (not the model's context window). Meaning depends on the unit.
    contextBudget: int('AGENT_CONTEXT_BUDGET', unit === 'tokens' ? 16000 : 40000, 1000),
    trimAt,
    summarizeAt,
    keepRecentTurns: int('AGENT_KEEP_RECENT_TURNS', 4, 1),
    ragKeepTurns: int('AGENT_RAG_KEEP_TURNS', 1, 0),
    ragTrimChars: int('AGENT_RAG_TRIM_CHARS', 200, 0),
    toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET || undefined,
  };
}
