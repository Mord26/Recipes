import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { stagingTurso } from '@/lib/staging/backend';
import { PROFILE_COOKIE, readProfileCookie } from '@/lib/staging/session';

// /sw.js must load without a session; /api/timers/dispatch is called by the cron with no cookie
// and /api/media is called server-to-server by the import route (both are guarded by their own
// secret header instead).
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/manifest.webmanifest',
  '/api/keepalive',
  '/api/timers/dispatch',
  '/api/media',
  '/sw.js',
  '/api/staging/seed',
  '/api/staging/media',
];

export async function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.get('familyFallback') === '402') request.headers.set('x-family-test-fallback','402');
  let response = NextResponse.next({ request });

  if (stagingTurso()) return stagingGate(request, response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getClaims verifies the JWT locally (asymmetric keys) and still refreshes
  // expired sessions through @supabase/ssr - no network round trip on the hot path.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Keep where they were headed. Wiping the query used to silently destroy a shared recipe
    // link when the session had expired: the person signed in and the link was simply gone.
    const target = `${path}${request.nextUrl.search}`;
    url.search = target === '/' ? '' : `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url);
  }

  if (user && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

// Staging bridge: the signed "מי אתה?" profile cookie replaces the Supabase session.
async function stagingGate(request: NextRequest, response: NextResponse) {
  const userId = await readProfileCookie(request.cookies.get(PROFILE_COOKIE)?.value);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
  if (!userId && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const target = `${path}${request.nextUrl.search}`;
    url.search = target === '/' ? '' : `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url);
  }
  if (userId && (path === '/login' || path === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|sw\\.js|api/keepalive|api/timers/dispatch|api/media|.*\\.(?:png|svg|jpg|webp)$).*)',
  ],
};
