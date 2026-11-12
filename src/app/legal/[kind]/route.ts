import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from '@/lib/supabase/config';
import { LEGAL_BUCKET, LEGAL_SAMPLE_PATHS, isLegalKind } from '@/lib/legal';

export const dynamic = 'force-dynamic';

/** Short cache: a new upload is live for everyone within a minute. */
const CACHE = 'public, max-age=60, s-maxage=60';

const redirect = (location: string, cache = CACHE) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': cache } });

/**
 * GET /legal/terms, /legal/privacy — public, no sign-in (the middleware skips /legal/*).
 * Redirects to the current version's PDF in the public "legal" bucket, or to the built-in
 * sample in public/legal/ while nothing has been uploaded. The mobile app, the AI notice and
 * the registration page link here, so the link never changes when a new version is uploaded.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isLegalKind(kind)) return new Response('Not found', { status: 404 });

  if (isSupabaseConfigured) {
    try {
      // Publishable key only: legal_documents is readable by anyone (RLS).
      const supabase = createClient(supabaseUrl, supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase
        .from('legal_documents')
        .select('storage_path')
        .eq('kind', kind)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data?.storage_path) {
        return redirect(supabase.storage.from(LEGAL_BUCKET).getPublicUrl(String(data.storage_path)).data.publicUrl);
      }
    } catch (e) {
      console.error('[legal]', kind, e instanceof Error ? e.message : e);
      // Database unreachable: show the sample now, but do not cache that answer.
      return redirect(LEGAL_SAMPLE_PATHS[kind], 'no-store');
    }
  }
  // Relative Location: correct behind the Railway proxy whatever host the request came in on.
  return redirect(LEGAL_SAMPLE_PATHS[kind]);
}
