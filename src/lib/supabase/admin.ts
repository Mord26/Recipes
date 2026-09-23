import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { stagingTurso } from '@/lib/staging/backend';
import { createStagingAdminClient } from '@/lib/staging/server-client';

export function createSupabaseAdminClient() {
  if (stagingTurso()) return createStagingAdminClient() as unknown as ReturnType<typeof createClient>;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
