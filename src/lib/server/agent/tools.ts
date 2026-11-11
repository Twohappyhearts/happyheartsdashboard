import 'server-only';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { AGENT_LANGUAGES, CARETEAM_SITUATIONS } from '@/lib/agent-fixed-replies';
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
  /** toolCallId → the care-team message as the patient edited it in the confirmation. */
  careteamEdits?: Map<string, string>;
  /** Web search on the trusted sites; the webSearch tool exists only when this is set. */
  searchWeb?: WebSearchFn | null;
  /** The sites web search is limited to, named in the tool description. */
  webSites?: string[];
  /** Name of the language care-team drafts are written in (e.g. "English"); see settings.ts. */
  careteamLanguageName?: string;
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
  if (!ids.length) return new Map<string, { source: string | null; url: string | null }>();
  const { data } = await caller.admin.from('knowledge_documents').select('id, description').in('id', ids);
  return new Map((data ?? []).map((d) => [String(d.id), parseDocumentSource(d.description as string | null)]));
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
        const r = await retrieve(caller.admin, { query, topK: topK ?? DEFAULT_TOP_K, maxPerDocument: MAX_CHUNKS_PER_DOCUMENT });
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
          })),
        };
      },
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

  // Patients send a real alert. Staff/admin use the dashboard to try the assistant,
  // so for them the tool goes through the same approval step but sends nothing.
  const preview = caller.role !== 'patient';

  return {
    ...tools,
    ...webTools,
    // Needs the user's approval before it runs (see toolApproval in run.ts).
    notifyCareteam: tool({
      description:
        "Offer to send a message to the patient's care team (it appears as an alert in the staff dashboard). " +
        'Call it when the patient asks to contact the care team, AND proactively whenever the patient says they feel unwell or ' +
        'describes a symptom or concern about their body or mood (e.g. dizziness, chest discomfort, shortness of breath, swelling, ' +
        'pain, a wound problem, feeling very low or anxious, side effects). ' +
        "Calling it shows the patient a Send / Cancel prompt with your message; nothing is sent unless they press Send, so offering is cheap — when in doubt, offer. " +
        'You only get a result after they pressed Send. Do not ask them to confirm in your text. ' +
        'The patient can edit your draft before sending. At most once per concern; if they cancel, do not offer again for the same concern unless they ask. ' +
        'If it fails, do not call it again: tell the patient it was not sent and to use the "I need assistance" button or message the Care Team. Not a substitute for 911 in an emergency.',
      inputSchema: z.object({
        situation: z
          .enum(CARETEAM_SITUATIONS)
          .describe(
            'Which fixed reply goes with this offer: "personal" (rule 2 referral), "urgent" (1b), "crisis" (1a about the user), "crisis_other" (1a about someone else). The app shows that reply above the offer if you wrote no text.',
          ),
        // A plain string, not an enum: an unexpected code must never make the offer fail. The app
        // falls back to English for a code it does not know.
        language: z
          .string()
          .max(20)
          .optional()
          .describe(
            `Code of your reply's language: ${AGENT_LANGUAGES.map((l) => `"${l}"`).join(', ')}; "en" for any other language. The app shows the fixed reply in this language if you wrote no text.`,
          ),
        message: z
          .string()
          .min(1)
          .max(1000)
          .describe(
            `1–4 sentences for the care team, written as the patient (first person) in ${opts.careteamLanguageName ?? 'English'}: what they feel or asked, since when, and every detail they gave (medicine names, doses, how often, symptoms, numbers, times). No diagnosis.`,
          ),
      }),
      execute: async ({ message }, { toolCallId }) => {
        // The patient may have edited the draft in the confirmation before pressing Send.
        const edited = opts.careteamEdits?.get(toolCallId);
        const sentMessage = (edited ?? message).trim();
        const editedByPatient = edited != null && edited.trim() !== message.trim();
        if (preview) {
          return { requestId: null, status: 'PREVIEW', sentAt: new Date().toISOString(), preview: true as const, sentMessage, editedByPatient };
        }
        // Inserted AS the patient. Only `message` is granted to clients: the trigger fills in
        // patient_id from auth.uid(), and RLS + the hourly rate limit apply.
        const { data, error } = await caller.userClient
          .from('assistance_requests')
          .insert({ message: `[Sent via AI assistant] ${sentMessage}` })
          .select('id, status, created_at')
          .single();
        if (error) {
          console.error('[agent] notifyCareteam insert failed', error);
          throw new AgentToolError(
            error.hint === 'rate_limited'
              ? 'Too many requests were sent in the last hour, so this one was not sent.'
              : 'The message could not be sent to the care team.',
          );
        }
        return {
          requestId: data.id as string,
          status: data.status as string,
          sentAt: data.created_at as string,
          preview: false as const,
          sentMessage,
          editedByPatient,
        };
      },
      // What the model reads back. The approval already happened, so say plainly that it was sent;
      // the preview flag is for the UI only (the model answers exactly as it would for a patient).
      toModelOutput: ({ output }) => ({
        type: 'text',
        value:
          'The patient pressed Send and the message was delivered to the care team as an alert' +
          (output.editedByPatient ? ' (the patient edited your draft before sending)' : '') +
          `. Message sent: "${output.sentMessage}". ` +
          'Tell the patient it has been sent and the care team will follow up; do not ask them to confirm again.',
      }),
    }),
  } satisfies ToolSet;
}

export type AgentTools = ReturnType<typeof createAgentTools>;

/** Tools that must be approved by the user before they run. */
export const TOOLS_NEEDING_APPROVAL = ['notifyCareteam'] as const;
