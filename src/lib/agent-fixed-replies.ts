/**
 * Fixed replies of the Happy Hearts assistant, quoted word for word in the
 * system prompt and shown by the app when the model offers a care-team message
 * without writing any text first. Change them only together with the test set.
 * Shared by server (prompt) and client (chat UI), so no server-only imports here.
 */

/**
 * The research team's disclaimer (Laura Narvaez, 2026-10-21), shown word for word as a fixed
 * notice under the chat box on the dashboard and in the mobile app.
 */
export const AI_DISCLAIMER =
  'Notice: AI-generated responses may occasionally be inaccurate or out of scope. Verify details and consult your healthcare provider. See Terms of Use.';

/** Why the assistant is offering a care-team message; picks the fixed reply. */
export const CARETEAM_SITUATIONS = ['personal', 'urgent', 'crisis', 'crisis_other'] as const;
export type CareteamSituation = (typeof CARETEAM_SITUATIONS)[number];

export const FIXED_REPLIES: Record<CareteamSituation, string> = {
  // Rule 2: personal or clinical question.
  personal: 'Please contact your healthcare provider.',
  // Rule 1b: symptoms that may need emergency care (worded so it fits the user or someone else).
  urgent: 'These symptoms can be serious. Call 911 now or go to the nearest emergency room. Then let the healthcare provider know.',
  // Rule 1a: thoughts of harming oneself or others.
  crisis:
    "I'm sorry you are going through this. You don't have to face it alone. If you might act on these thoughts or you are in danger, call 911 now. You can call or text 988 any time to talk with someone. You can also call the National Maternal Mental Health Hotline at 1-833-852-6262.",
  // Rule 1a, reported by someone else (partner, friend).
  crisis_other:
    'This may be an emergency. If she might act on these thoughts or is in danger, call 911 now. You can call or text 988 any time for help and advice. You can also call the National Maternal Mental Health Hotline at 1-833-852-6262.',
};

/** Rule 4: the search results do not answer a pregnancy or postpartum question. */
export const NO_INFORMATION_REPLY = "I don't have information on that. Please ask your healthcare provider.";

export const isCareteamSituation = (v: unknown): v is CareteamSituation =>
  typeof v === 'string' && (CARETEAM_SITUATIONS as readonly string[]).includes(v);
