import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config';

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

  if (!signedIn && path.startsWith('/api/')) {
    // API callers get JSON, not a redirect to the sign-in page.
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
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
