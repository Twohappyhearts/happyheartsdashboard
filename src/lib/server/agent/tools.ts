import 'server-only';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { retrieve } from '@/lib/server/retrieval';
import type { AgentCaller } from './auth';
import type { WebSearchFn } from './websearch';

/** Name of the RAG tool; context.ts trims its old outputs. */
export const SEARCH_TOOL = 'searchKnowledge';
/** Web search on the trusted sites (websearch.ts); results have the same shape and ref numbers. */
export const WEB_TOOL = 'webSearch';
/** Tools whose results the model cites with "[sources: …]"; context.ts trims their old outputs. */
export const RESULT_TOOLS: ReadonlySet<string> = new Set([SEARCH_TOOL, WEB_TOOL]);

const MAX_CHUNK_CHARS = 2000;
/** Two chunks per document at most, so a second source that disagrees can make the top results. */
const MAX_CHUNKS_PER_DOCUMENT = 2;
/** Eight results: a section that answers "when / how much" often ranks 6th to 8th behind overview sections. */
const DEFAULT_TOP_K = 8;
/**
 * The community resource directory is one generated document (source_type 'resources') of many
 * separate entries, so it may fill the whole top K (Bo, 2026-11-11).
 */
const MAX_CHUNKS_BY_SOURCE_TYPE = { resources: DEFAULT_TOP_K };

export interface SearchResultItem {
  /** Number the model cites in its "[sources: …]" line; unique within one reply. */
  ref: number;
  chunkId: string;
  title: string;
  section: string;
  /** Publisher in plain words and the original page, from the document's description. */
  source: string | null;
  url: string | null;
  content: string;
  /** "web" for webSearch results; absent for the knowledge base. */
  kind?: 'web';
  /**
   * Knowledge-base document, so the app can open its original file (GET /api/agent/sources/:id)
   * when it has no web page. Not shown to the model (toModelOutput).
   */
  documentId?: string;
  /**
   * true for the community resource directory (source_type 'resources'): the app leaves it out
   * of the answer's source list, since it is one long generated article. Not shown to the model.
   */
  hideAsSource?: boolean;
}

export interface SearchToolOutput {
  results: SearchResultItem[];
  /** Set when context.ts shortened this output for an older turn. */
  trimmed?: boolean;
  note?: string;
}

/**
 * Tools for one request. They close over the caller, so a tool can never act
 * for another user.
 */
/** A tool failure whose message is safe to show the patient and the model. */
export class AgentToolError extends Error {}

export interface AgentToolOptions {
  /** Web search on the trusted sites; the webSearch tool exists only when this is set. */
  searchWeb?: WebSearchFn | null;
  /** The sites web search is limited to, named in the tool description. */
  webSites?: string[];
}

/**
 * Documents are uploaded with a description like
 * "Source: MedlinePlus, from the National Library of Medicine. Original page: https://…. License: …".
 */
export function parseDocumentSource(description: string | null | undefined): { source: string | null; url: string | null } {
  const text = description ?? '';
  const source = /Source:\s*(.+?)\.\s*Original page:/i.exec(text)?.[1]?.trim() ?? null;
  const url = /Original page:\s*(https?:\/\/\S+?)\.?(?:\s|$)/i.exec(text)?.[1] ?? null;
  return { source, url };
}

async function documentSources(caller: AgentCaller, documentIds: string[]) {
  const ids = Array.from(new Set(documentIds));
  type DocumentSource = { source: string | null; url: string | null; directory: boolean };
  if (!ids.length) return new Map<string, DocumentSource>();
  const { data } = await caller.admin.from('knowledge_documents').select('id, description, source_type').in('id', ids);
  return new Map<string, DocumentSource>(
    (data ?? []).map((d) => [
      String(d.id),
      { ...parseDocumentSource(d.description as string | null), directory: d.source_type === 'resources' },
    ]),
  );
}

/** A search output without the fields only the app uses. */
function forModel(output: SearchToolOutput) {
  return {
    results: (output.results ?? []).map(({ documentId: _documentId, hideAsSource: _hide, ...r }) => r),
    ...(output.trimmed ? { trimmed: true } : {}),
    ...(output.note ? { note: output.note } : {}),
  };
}

export function createAgentTools(caller: AgentCaller, opts: AgentToolOptions = {}) {
  // Refs keep counting across searches in the same reply, so "[sources: …]" is unambiguous.
  let nextRef = 1;
  const tools = {
    [SEARCH_TOOL]: tool({
      description:
        "Search the HappyHearts knowledge base (care-team approved education material). " +
        "Use it before answering a general health-education question, including the general part of a question about the user's own situation. " +
        "Never use the results to judge the user's own symptoms, numbers or medicines.",
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('What to look for, phrased as a search query.'),
        topK: z.number().int().min(1).max(8).optional().describe(`How many passages to return (default ${DEFAULT_TOP_K}).`),
      }),
      execute: async ({ query, topK }): Promise<SearchToolOutput> => {
        const r = await retrieve(caller.admin, {
          query,
          topK: topK ?? DEFAULT_TOP_K,
          maxPerDocument: MAX_CHUNKS_PER_DOCUMENT,
          maxPerDocumentBySourceType: MAX_CHUNKS_BY_SOURCE_TYPE,
        });
        const sources = await documentSources(caller, r.results.map((c) => c.documentId));
        return {
          results: r.results.map((c) => ({
            ref: nextRef++,
            chunkId: c.chunkId,
            title: c.title,
            section: c.outlinePath.join(' > '),
            source: sources.get(c.documentId)?.source ?? null,
            url: sources.get(c.documentId)?.url ?? null,
            content: c.content.length > MAX_CHUNK_CHARS ? `${c.content.slice(0, MAX_CHUNK_CHARS)}…` : c.content,
            documentId: c.documentId,
            ...(sources.get(c.documentId)?.directory ? { hideAsSource: true } : {}),
          })),
        };
      },
      // The model reads the results exactly as before: without the document ids.
      toModelOutput: ({ output }) => ({ type: 'json', value: forModel(output) }),
    }),
  } satisfies ToolSet;

  const searchWeb = opts.searchWeb;
  // Named so the model knows what kind of sites it searches; kept short.
  const webSites = (opts.webSites ?? []).slice(0, 15);
  const webTools: ToolSet = searchWeb
    ? {
        [WEB_TOOL]: tool({
          description:
            `Search a few trusted health websites${webSites.length ? ` (${webSites.join(', ')})` : ''}. ` +
            'Equally important as searchKnowledge: call both in the same step for every general health-education question. ' +
            'Write the query in English as a general topic; never include names, usernames, numbers or other personal details.',
          inputSchema: z.object({
            query: z.string().min(1).max(300).describe('General topic to look for, in English, phrased as a search query.'),
          }),
          execute: async ({ query }): Promise<SearchToolOutput> => {
            try {
              const hits = await searchWeb(query);
              return {
                results: hits.map((h, i) => ({
                  ref: nextRef++,
                  chunkId: `web-${i}-${h.url}`,
                  title: h.title,
                  section: h.domain,
                  source: h.source,
                  url: h.url,
                  content: h.content,
                  kind: 'web' as const,
                })),
              };
            } catch (e) {
              console.warn('[agent] webSearch failed', e instanceof Error ? e.message : e);
              // Not fatal: the model answers from the knowledge base.
              return { results: [], note: 'Web search is unavailable right now. Use the knowledge-base results.' };
            }
          },
        }),
      }
    : {};

  // No tool that acts for the patient: requests to the care team are sent only from the app's
  // side menu ("I need assistance"), not from the assistant (2026-11-23).
  return {
    ...tools,
    ...webTools,
  } satisfies ToolSet;
}

export type AgentTools = ReturnType<typeof createAgentTools>;

/**
 * Tools that must be approved by the user before they run. None at the moment (notifyCareteam
 * was removed on 2026-11-23); the approval flow in run.ts / approval.ts stays for future tools.
 */
export const TOOLS_NEEDING_APPROVAL: readonly string[] = [];
