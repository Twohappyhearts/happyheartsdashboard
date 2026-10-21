import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './config';

/**
 * Admin client using SUPABASE_SECRET_KEY. BYPASSES RLS.
 * Only import from server code (Route Handlers / Server Actions), e.g. staff provisioning.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not set (put it in .env.local).');
  }
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
