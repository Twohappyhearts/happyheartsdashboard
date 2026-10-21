import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config';

let browserClient: SupabaseClient | undefined;

/** Supabase client for Client Components ('use client'). Singleton per tab. */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  assertSupabaseConfigured();
  browserClient = createBrowserClient(supabaseUrl, supabasePublishableKey);
  return browserClient;
}
