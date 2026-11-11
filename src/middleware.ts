import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skipped: static assets, and /legal/* (Terms of Use and Privacy Policy, public without sign-in).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|legal/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
