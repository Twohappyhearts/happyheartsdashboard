import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_NOTICE_VERSION } from '@/lib/agent-consent';
import { ApiError } from '@/lib/server/staff-auth';
import type { AgentCaller } from './auth';

/**
 * Acceptance of the AI assistant notice (public.agent_consents).
 * Patients must accept the current version before they can chat; staff and admin
 * accounts (who try the assistant on the dashboard) are not asked.
 *
 * An acceptance counts when it is for AI_NOTICE_VERSION or later AND for the Terms of Use that
 * is current now (agent_consents.terms_version >= the newest legal_documents version of kind
 * 'terms', 0 when none was uploaded). Uploading a new Terms of Use therefore asks every
 * patient again.
 */

const TERMS_TTL_MS = 60_000;
let terms: { at: number; version: number } | null = null;

/**
 * Version of the current Terms of Use, cached for about a minute. If it cannot be read, the last
 * known version (0 before the first read): the notice version is still checked.
 */
export async function currentTermsVersion(admin: SupabaseClient): Promise<number> {
  if (terms && Date.now() - terms.at < TERMS_TTL_MS) return terms.version;
  const { data, error } = await admin
    .from('legal_documents')
    .select('version')
    .eq('kind', 'terms')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[agent] could not read the Terms of Use version', error.message);
    return terms?.version ?? 0;
  }
  const version = data ? Number(data.version) || 0 : 0;
  terms = { at: Date.now(), version };
  return version;
}

/**
 * userId → Terms of Use version of an acceptance known to count. Checked against the current
 * Terms version on every turn, so a newly uploaded Terms of Use makes these entries stale.
 */
const accepted = new Map<string, number>();

export const consentRequired = (caller: Pick<AgentCaller, 'role'>) => caller.role === 'patient';

export interface ConsentStatus {
  agreed: boolean;
  agreedAt: string | null;
  /** The current Terms of Use version (0 = none uploaded yet). */
  termsVersion: number;
}

export async function consentStatus(admin: SupabaseClient, userId: string): Promise<ConsentStatus> {
  const [{ data, error }, current] = await Promise.all([
    admin.from('agent_consents').select('version, terms_version, agreed_at').eq('user_id', userId).maybeSingle(),
    currentTermsVersion(admin),
  ]);
  if (error) throw error;
  const acceptedTerms = data ? Number(data.terms_version ?? 0) : 0;
  const agreed = !!data && Number(data.version) >= AI_NOTICE_VERSION && acceptedTerms >= current;
  if (agreed) accepted.set(userId, acceptedTerms);
  else accepted.delete(userId);
  return { agreed, agreedAt: agreed ? String(data.agreed_at) : null, termsVersion: current };
}

/**
 * Record that the user accepted the current notice and Terms of Use. Accepting the same
 * versions twice keeps the first date; accepting newer versions replaces the record.
 */
export async function recordConsent(admin: SupabaseClient, userId: string): Promise<{ agreedAt: string; termsVersion: number }> {
  const current = await consentStatus(admin, userId);
  if (current.agreed && current.agreedAt) return { agreedAt: current.agreedAt, termsVersion: current.termsVersion };
  const agreedAt = new Date().toISOString();
  const { error } = await admin
    .from('agent_consents')
    .upsert(
      { user_id: userId, version: AI_NOTICE_VERSION, terms_version: current.termsVersion, agreed_at: agreedAt },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
  accepted.set(userId, current.termsVersion);
  return { agreedAt, termsVersion: current.termsVersion };
}

/** Refuse a chat turn from a patient who has not accepted the current notice and Terms of Use. */
export async function assertConsent(caller: AgentCaller): Promise<void> {
  if (!consentRequired(caller)) return;
  const known = accepted.get(caller.userId);
  if (known != null && known >= (await currentTermsVersion(caller.admin))) return;
  const { agreed } = await consentStatus(caller.admin, caller.userId);
  if (!agreed) throw new ApiError(403, 'Please read and accept the AI assistant notice first.');
}
