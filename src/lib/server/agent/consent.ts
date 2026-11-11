import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_NOTICE_VERSION } from '@/lib/agent-consent';
import { ApiError } from '@/lib/server/staff-auth';
import type { AgentCaller } from './auth';

/**
 * Acceptance of the AI assistant notice (public.agent_consents).
 * Patients must accept the current version before they can chat; staff and admin
 * accounts (who try the assistant on the dashboard) are not asked.
 */

/** Users known to have accepted the current version; acceptance is never withdrawn. */
const accepted = new Set<string>();

export const consentRequired = (caller: Pick<AgentCaller, 'role'>) => caller.role === 'patient';

export async function consentStatus(admin: SupabaseClient, userId: string): Promise<{ agreed: boolean; agreedAt: string | null }> {
  const { data, error } = await admin.from('agent_consents').select('version, agreed_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const agreed = !!data && Number(data.version) >= AI_NOTICE_VERSION;
  if (agreed) accepted.add(userId);
  return { agreed, agreedAt: agreed ? String(data.agreed_at) : null };
}

/** Record that the user accepted the current notice. Accepting twice keeps the first date. */
export async function recordConsent(admin: SupabaseClient, userId: string): Promise<{ agreedAt: string }> {
  const current = await consentStatus(admin, userId);
  if (current.agreed && current.agreedAt) return { agreedAt: current.agreedAt };
  const agreedAt = new Date().toISOString();
  const { error } = await admin
    .from('agent_consents')
    .upsert({ user_id: userId, version: AI_NOTICE_VERSION, agreed_at: agreedAt }, { onConflict: 'user_id' });
  if (error) throw error;
  accepted.add(userId);
  return { agreedAt };
}

/** Refuse a chat turn from a patient who has not accepted the notice. */
export async function assertConsent(caller: AgentCaller): Promise<void> {
  if (!consentRequired(caller) || accepted.has(caller.userId)) return;
  const { agreed } = await consentStatus(caller.admin, caller.userId);
  if (!agreed) throw new ApiError(403, 'Please read and accept the AI assistant notice first.');
}
