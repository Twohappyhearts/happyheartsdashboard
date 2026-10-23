import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createCookieClient } from '@/lib/supabase/server';
import { supabasePublishableKey, supabaseUrl } from '@/lib/supabase/config';
import { ApiError, type AccountRole } from '@/lib/server/staff-auth';

export interface AgentCaller {
  userId: string;
  role: AccountRole;
  /** Supabase client acting AS the caller: RLS and triggers apply. */
  userClient: SupabaseClient;
  /** Service-role client. Bypasses RLS — every query must filter by userId. */
  admin: SupabaseClient;
}

/**
 * Who is calling the agent API.
 *  - Mobile app: `Authorization: Bearer <Supabase access token>`
 *  - Dashboard (same-site testing): the Supabase session cookie
 * The JWT is verified by Supabase; the account must be active.
 */
/**
 * Kept for the life of the server process so the project's JWT signing keys
 * (JWKS) stay cached: getClaims then verifies tokens locally, without a
 * network round trip per request.
 */
let verifier: SupabaseClient | null = null;
const tokenVerifier = () => (verifier ??= createAdminClient());

export async function requireAgentCaller(request: Request): Promise<AgentCaller> {
  const header = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  const admin = createAdminClient();

  let userId: string;
  let userClient: SupabaseClient;
  if (token) {
    // Verifies the signature and expiry (locally with asymmetric signing keys).
    const { data, error } = await tokenVerifier().auth.getClaims(token);
    const sub = data?.claims?.sub;
    if (error || typeof sub !== 'string') throw new ApiError(401, 'Please sign in again.');
    userId = sub;
    userClient = createSupabaseClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    const cookieClient = await createCookieClient();
    const { data, error } = await cookieClient.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || typeof sub !== 'string') throw new ApiError(401, 'Please sign in again.');
    userId = sub;
    userClient = cookieClient;
  }

  // Disabled accounts are refused even while their token is still valid.
  const { data: row, error: roleErr } = await admin
    .from('account_roles')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleErr) throw roleErr;
  if (!row || !row.is_active) throw new ApiError(403, 'This account is disabled.');

  return { userId, role: row.role as AccountRole, userClient, admin };
}
