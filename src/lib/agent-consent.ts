import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The notice a patient accepts the first time they open the AI assistant
 * (public.agent_consents; recorded by POST /api/agent/consent).
 *
 * Raise AI_NOTICE_VERSION when the wording changes in a way patients must accept again:
 * everyone who accepted an older version is asked once more.
 * Shared by server and client, so no server-only imports here.
 */
export const AI_NOTICE_VERSION = 1;

export type NoticeLanguage = 'en' | 'es';

export interface NoticeText {
  title: string;
  points: string[];
  agree: string;
  /** Label of the button that switches to the other language. */
  switchTo: string;
}

/** Wording by the development team; the Spanish text waits for the research team's review. */
export const AI_NOTICE: Record<NoticeLanguage, NoticeText> = {
  en: {
    title: 'Before you use the AI assistant',
    points: [
      'Answers are written by AI. They are general health education for reference only, and can sometimes be wrong or incomplete.',
      'The assistant is not a doctor or nurse. It cannot diagnose you and does not replace advice from your healthcare provider.',
      'If you feel unwell or are worried about your health, contact your healthcare provider or care team. In an emergency, call 911.',
    ],
    agree: 'I understand and agree',
    switchTo: 'Español',
  },
  es: {
    title: 'Antes de usar el asistente de IA',
    points: [
      'Las respuestas las escribe una IA. Son educación general sobre salud, solo como referencia, y a veces pueden ser incorrectas o incompletas.',
      'El asistente no es médico ni enfermera. No puede darle un diagnóstico y no reemplaza el consejo de su proveedor de atención médica.',
      'Si se siente mal o le preocupa su salud, comuníquese con su proveedor de atención médica o su equipo de atención. En una emergencia, llame al 911.',
    ],
    agree: 'Entiendo y acepto',
    switchTo: 'English',
  },
};

export interface AgentConsent {
  userId: string;
  version: number;
  agreedAt: string;
}

/** Everyone who accepted the notice (staff only, by RLS). */
export async function listConsents(supabase: SupabaseClient): Promise<AgentConsent[]> {
  const { data, error } = await supabase.from('agent_consents').select('user_id, version, agreed_at').limit(10000);
  if (error) {
    if (error.code === '42501') throw new Error('Your account does not have staff permission.');
    if (error.code === 'PGRST205' || error.code === '42P01') throw new Error('Run the agent_consents migration first.');
    throw new Error(error.message || 'Could not load the AI notice records.');
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    userId: String(r.user_id),
    version: Number(r.version ?? 0),
    agreedAt: String(r.agreed_at ?? ''),
  }));
}
