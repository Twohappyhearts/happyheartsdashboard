import { NextResponse } from 'next/server';
import { AI_NOTICE_VERSION } from '@/lib/agent-consent';
import { jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { consentRequired, consentStatus, recordConsent } from '@/lib/server/agent/consent';
import { careTeamLanguage } from '@/lib/server/agent/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/agent/consent — has the caller accepted the current AI assistant notice?
 * POST /api/agent/consent — the caller accepts it (pressed "I understand and agree").
 *
 * Auth as the other agent routes (Bearer token from the app, or the dashboard cookie).
 * `required` is false for staff and admin accounts, who are not asked.
 * `careTeamLanguage`: the language messages to the care team are written in (Settings), so the
 * chat can tell the patient before they send one.
 */
export async function GET(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    const [status, language] = await Promise.all([consentStatus(caller.admin, caller.userId), careTeamLanguage(caller.admin)]);
    return NextResponse.json({ ...status, required: consentRequired(caller), version: AI_NOTICE_VERSION, careTeamLanguage: language });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(request: Request) {
  try {
    const caller = await requireAgentCaller(request);
    const [{ agreedAt }, language] = await Promise.all([recordConsent(caller.admin, caller.userId), careTeamLanguage(caller.admin)]);
    return NextResponse.json({ agreed: true, agreedAt, required: consentRequired(caller), version: AI_NOTICE_VERSION, careTeamLanguage: language });
  } catch (e) {
    return jsonError(e);
  }
}
