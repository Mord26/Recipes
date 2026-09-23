import 'server-only';
import { cookies } from 'next/headers';
import { rpc, StagingQuery, storageBucket, type Ctx } from './engine';
import { TursoStore } from './turso';
import { PROFILE_COOKIE, readProfileCookie } from './session';

async function actorFromCookies(): Promise<string | null> {
  try { return await readProfileCookie((await cookies()).get(PROFILE_COOKIE)?.value); } catch { return null; }
}

const unavailable = async () => ({ data: { user: null }, error: { message: 'Not available in staging', status: 400, code: 'staging' } });

function build(ctx: Ctx) {
  const auth = {
    async getClaims() { return { data: ctx.actor ? { claims: { sub: ctx.actor } } : null, error: null }; },
    async getUser() { return { data: { user: ctx.actor ? { id: ctx.actor } : null }, error: null }; },
    async getSession() { return { data: { session: ctx.actor ? { user: { id: ctx.actor } } : null }, error: null }; },
    async signOut() { try { (await cookies()).delete(PROFILE_COOKIE); } catch { /* read-only context */ } return { error: null }; },
    signInWithPassword: unavailable,
    updateUser: unavailable,
    admin: { createUser: unavailable, getUserById: unavailable, updateUserById: unavailable, deleteUser: unavailable },
  };
  return {
    from: (table: string) => new StagingQuery(ctx, table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => rpc(ctx, fn, args),
    storage: { from: (bucket: string) => storageBucket(ctx, bucket) },
    auth,
  };
}

export async function createStagingServerClient() {
  const actor = await actorFromCookies();
  return build({ store: new TursoStore(), actor, admin: false });
}

// Admin (service-role equivalent): no row rules; writes are still attributed to the chosen profile.
export function createStagingAdminClient() {
  return build({ store: new TursoStore(), actor: null, admin: true, actorForLog: actorFromCookies });
}
