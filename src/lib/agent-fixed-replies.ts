/**
 * Fixed replies of the Happy Hearts assistant, quoted word for word in the
 * system prompt and shown by the app when the model offers a care-team message
 * without writing any text first. Change them only together with the test set.
 * Shared by server (prompt) and client (chat UI), so no server-only imports here.
 *
 * The assistant answers in English or Spanish (Dr. Guo, 2026-11-02). The Spanish wording is the
 * team's translation, waiting for the research team's review.
 */

/** Languages the assistant answers in. */
export const AGENT_LANGUAGES = ['en', 'es'] as const;
export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

export const isAgentLanguage = (v: unknown): v is AgentLanguage =>
  typeof v === 'string' && (AGENT_LANGUAGES as readonly string[]).includes(v);

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

/**
 * The same replies in Spanish. 988 answers in Spanish when the caller presses 2 or texts AYUDA
 * (988lifeline.org); the maternal mental health hotline has Spanish-speaking counselors (HRSA).
 */
export const FIXED_REPLIES_ES: Record<CareteamSituation, string> = {
  personal: 'Por favor, comuníquese con su proveedor de atención médica.',
  urgent:
    'Estos síntomas pueden ser graves. Llame al 911 ahora o vaya a la sala de emergencias más cercana. Después, avísele al proveedor de atención médica.',
  crisis:
    'Siento mucho que esté pasando por esto. No tiene que enfrentarlo sin ayuda. Si siente que podría actuar según estos pensamientos o está en peligro, llame al 911 ahora. Puede llamar o enviar un mensaje de texto al 988 en cualquier momento para hablar con alguien: al llamar, oprima 2 para español; por texto, escriba AYUDA. También puede llamar a la Línea Nacional de Salud Mental Materna al 1-833-852-6262, que atiende en español.',
  crisis_other:
    'Esto puede ser una emergencia. Si ella podría actuar según estos pensamientos o está en peligro, llame al 911 ahora. Puede llamar o enviar un mensaje de texto al 988 en cualquier momento para pedir ayuda y consejo: al llamar, oprima 2 para español; por texto, escriba AYUDA. También puede llamar a la Línea Nacional de Salud Mental Materna al 1-833-852-6262, que atiende en español.',
};

/** Rule 4: the search results do not answer a pregnancy or postpartum question. */
export const NO_INFORMATION_REPLY = "I don't have information on that. Please ask your healthcare provider.";
export const NO_INFORMATION_REPLY_ES = 'No tengo información sobre eso. Por favor, pregúntele a su proveedor de atención médica.';

/** The fixed reply for a situation in the given language. */
export const fixedReply = (situation: CareteamSituation, language: AgentLanguage = 'en') =>
  (language === 'es' ? FIXED_REPLIES_ES : FIXED_REPLIES)[situation];

export const isCareteamSituation = (v: unknown): v is CareteamSituation =>
  typeof v === 'string' && (CARETEAM_SITUATIONS as readonly string[]).includes(v);
