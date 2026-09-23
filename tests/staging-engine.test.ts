import { describe, expect, it } from 'vitest';
import { StagingQuery, rpc, type Ctx, type Row, type Store, type Write } from '@/lib/staging/engine';
import { normalizeSnapshotRow } from '@/lib/staging/schema';

class MemStore implements Store {
  tables: Record<string, Row[]> = {};
  outbox: { actor: string | null; w: Write }[] = [];
  media: Record<string, number> = {};
  async load(t: string) { return (this.tables[t] ?? []).map((r) => ({ ...r })); }
  async commit(writes: Write[], actor: string | null) {
    for (const w of writes) {
      const { pkOf } = await import('@/lib/staging/schema');
      const list = (this.tables[w.table] ??= []);
      const i = list.findIndex((r) => pkOf(w.table, r) === w.pk);
      if (w.op === 'delete') { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = w.data!; else list.push(w.data!);
      this.outbox.push({ actor, w });
    }
  }
  async putMedia(o: { path: string; bytes: Uint8Array }) { this.media[o.path] = o.bytes.length; }
  async listMedia(prefix: string) { return Object.keys(this.media).filter((p) => p.startsWith(prefix)); }
  async removeMedia(paths: string[]) { for (const p of paths) delete this.media[p]; }
}

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
function seed() {
  const s = new MemStore();
  s.tables.profiles = [{ id: A, username: 'a', display_name: 'Alef', created_at: '2026-01-01' }, { id: B, username: 'b', display_name: 'Bet', created_at: '2026-01-02' }];
  s.tables.recipes = [
    { id: 'r1', owner_id: A, title: 'Soup', visibility: 'family', created_at: '2026-02-01', ingredients: [{ name: 'Salt' }] },
    { id: 'r2', owner_id: B, title: 'Secret', visibility: 'private', created_at: '2026-02-02', ingredients: [] },
  ];
  s.tables.recipe_photos = [{ id: 'p1', recipe_id: 'r1', storage_path: 'r1/x.webp', uploader_id: B, position: 0 }];
  s.tables.comments = [{ id: 'c1', recipe_id: 'r1', author_id: B, body: 'yum', visibility: 'everyone' }, { id: 'c2', recipe_id: 'r1', author_id: B, body: 'note', visibility: 'private' }];
  s.tables.favorites = [];
  return s;
}
const ctx = (store: Store, actor: string | null, admin = false): Ctx => ({ store, actor, admin });

describe('staging engine', () => {
  it('applies recipe visibility and embeds with fk hints and aliases', async () => {
    const s = seed();
    const { data } = await new StagingQuery(ctx(s, A), 'recipes')
      .select('*, profiles!recipes_owner_id_fkey(username, display_name), recipe_photos(id, storage_path, uploader:profiles!recipe_photos_uploader_id_fkey(display_name)), favorites(user_id)')
      .order('created_at', { ascending: false });
    expect(data.map((r: Row) => r.id)).toEqual(['r1']);
    expect(data[0].profiles).toEqual({ username: 'a', display_name: 'Alef' });
    expect(data[0].recipe_photos[0].uploader).toEqual({ display_name: 'Bet' });
    expect(data[0].favorites).toEqual([]);
  });
  it('hides private comments of others', async () => {
    const s = seed();
    const { data } = await new StagingQuery(ctx(s, A), 'comments').select('*, profiles!comments_author_id_fkey(username, display_name)').eq('recipe_id', 'r1');
    expect(data.map((c: Row) => c.id)).toEqual(['c1']);
  });
  it('insert returns the row, logs to outbox, rejects writes as someone else', async () => {
    const s = seed();
    const res = await new StagingQuery(ctx(s, A), 'recipes').insert({ owner_id: A, title: 'Bread', ingredients: [{ name: 'Flour' }] }).select('id').single();
    expect(res.error).toBeNull();
    expect(typeof res.data.id).toBe('string');
    expect(s.tables.recipes.find((r) => r.id === res.data.id)?.search_text).toContain('flour');
    expect(s.outbox.at(-1)?.actor).toBe(A);
    const bad = await new StagingQuery(ctx(s, A), 'recipes').insert({ owner_id: B, title: 'x' });
    expect(bad.error?.code).toBe('42501');
  });
  it('update only touches own rows; delete cascades with tombstone writes', async () => {
    const s = seed();
    await new StagingQuery(ctx(s, A), 'recipes').update({ title: 'Hack' }).eq('id', 'r2');
    expect(s.tables.recipes.find((r) => r.id === 'r2')?.title).toBe('Secret');
    await new StagingQuery(ctx(s, A), 'recipes').delete().eq('id', 'r1');
    expect(s.tables.recipes.map((r) => r.id)).toEqual(['r2']);
    expect(s.tables.recipe_photos).toEqual([]);
    expect(s.outbox.filter((o) => o.w.op === 'delete').map((o) => o.w.table).sort()).toEqual(['comments', 'comments', 'recipe_photos', 'recipes']);
  });
  it('upsert on composite conflict, unique lower violation, head count, maybeSingle', async () => {
    const s = seed();
    s.tables.ratings = [];
    await new StagingQuery(ctx(s, A), 'ratings').upsert({ user_id: A, recipe_id: 'r1', stars: 3 }, { onConflict: 'user_id,recipe_id' });
    await new StagingQuery(ctx(s, A), 'ratings').upsert({ user_id: A, recipe_id: 'r1', stars: 5 }, { onConflict: 'user_id,recipe_id' });
    expect(s.tables.ratings).toEqual([{ user_id: A, recipe_id: 'r1', stars: 5, created_at: expect.any(String) }]);
    s.tables.tags = [{ id: 't1', name: 'Soup' }];
    const dup = await new StagingQuery(ctx(s, A), 'tags').insert({ name: 'soup' });
    expect(dup.error?.code).toBe('23505');
    const c = await new StagingQuery(ctx(s, A), 'recipes').select('id', { count: 'exact', head: true }).eq('owner_id', A);
    expect(c.count).toBe(1);
    const none = await new StagingQuery(ctx(s, A), 'recipes').select('id').eq('id', 'nope').maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });
  });
  it('inner embed filters and rpc bump', async () => {
    const s = seed();
    s.tables.cook_logs = [{ id: 'k1', recipe_id: 'r1', user_id: A }];
    const { data } = await new StagingQuery(ctx(s, null, true), 'cook_logs').select('recipe_id, recipes!inner(owner_id)');
    expect(data).toEqual([{ recipe_id: 'r1', recipes: { owner_id: A } }]);
    const r = await rpc(ctx(s, A), 'bump_ai_usage', { daily_limit: 1 });
    expect(r.data).toBe(true);
    expect((await rpc(ctx(s, A), 'bump_ai_usage', { daily_limit: 1 })).data).toBe(false);
  });
  it('normalizes snapshot text export', () => {
    expect(normalizeSnapshotRow('profiles', { blocked: 'f', can_add_recipes: 't', created_at: '2026-07-27 17:26:34.1+00' }))
      .toEqual({ blocked: false, can_add_recipes: true, created_at: '2026-07-27T17:26:34.1+00:00' });
    expect(normalizeSnapshotRow('recipes', { servings: '8', steps: '["a"]', prep_minutes: null })).toEqual({ servings: 8, steps: ['a'], prep_minutes: null });
  });
});
