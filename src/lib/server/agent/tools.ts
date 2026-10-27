import 'server-only';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { CARETEAM_SITUATIONS } from '@/lib/agent-fixed-replies';
import { retrieve } from '@/lib/server/retrieval';
import type { AgentCaller } from './auth';

/** Name of the RAG tool; context.ts trims its old outputs. */
export const SEARCH_TOOL = 'searchKnowledge';

const MAX_CHUNK_CHARS = 2000;

export interface SearchResultItem {
  chunkId: string;
  title: string;
  section: string;
  content: string;
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
}

export function createAgentTools(caller: AgentCaller, opts: AgentToolOptions = {}) {
  const tools = {
    [SEARCH_TOOL]: tool({
      description:
        "Search the HappyHearts knowledge base (care-team approved education material). " +
        "Use it before answering a general health-education question. Do not use it for questions about the user's own health, symptoms, numbers or medicines.",
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('What to look for, phrased as a search query.'),
        topK: z.number().int().min(1).max(8).optional().describe('How many passages to return (default 5).'),
      }),
      execute: async ({ query, topK }): Promise<SearchToolOutput> => {
        const r = await retrieve(caller.admin, { query, topK: topK ?? 5 });
        return {
          results: r.results.map((c) => ({
            chunkId: c.chunkId,
            title: c.title,
            section: c.outlinePath.join(' > '),
            content: c.content.length > MAX_CHUNK_CHARS ? `${c.content.slice(0, MAX_CHUNK_CHARS)}…` : c.content,
          })),
        };
      },
    }),
  } satisfies ToolSet;

  // Patients send a real alert. Staff/admin use the dashboard to try the assistant,
  // so for them the tool goes through the same approval step but sends nothing.
  const preview = caller.role !== 'patient';

  return {
    ...tools,
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
        message: z
          .string()
          .min(1)
          .max(1000)
          .describe("1–3 sentences for the care team written as the patient (first person): what they feel, since when, anything they mentioned. No diagnosis."),
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
