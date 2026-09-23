import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { stagingTurso } from '@/lib/staging/backend';
import { createStagingServerClient } from '@/lib/staging/server-client';

export async function createSupabaseServerClient() {
  if (stagingTurso()) {
    return (await createStagingServerClient()) as unknown as ReturnType<typeof createServerClient>;
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; the proxy refreshes sessions instead.
          }
        },
      },
    }
  );
}
