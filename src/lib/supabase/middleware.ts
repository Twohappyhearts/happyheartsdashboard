import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config';
import { isStaffLang, STAFF_LANG_COOKIE, staffTextFor } from '@/lib/i18n/staff';

const PUBLIC_PATHS = ['/sign-up-login'];

/**
 * Refreshes the Supabase auth session cookie on each request and sends
 * signed-out visitors to the sign-in page. The staff-role check happens in
 * AppLayout (and is enforced for data by RLS in the database).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not remove: this validates the JWT and triggers the token refresh.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // The mobile app calls the agent API with a Bearer token instead of the cookie;
  // those routes verify the token themselves (src/lib/server/agent/auth.ts).
  const hasBearer = /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '');
  if (!signedIn && hasBearer && path.startsWith('/api/agent/')) return response;

  if (!signedIn && path.startsWith('/api/')) {
    // API callers get JSON, not a redirect to the sign-in page (in the dashboard language).
    const lang = request.cookies.get(STAFF_LANG_COOKIE)?.value;
    const message = staffTextFor(isStaffLang(lang) ? lang : 'en').serverMessages.signInAgain;
    return NextResponse.json({ error: message }, { status: 401 });
  }

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-up-login';
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
