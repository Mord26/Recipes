/* eslint-disable @typescript-eslint/no-explicit-any */
// A small PostgREST-compatible query engine used only when FAMILY_DB_BACKEND=turso.
// It supports the subset of the supabase-js builder this app actually calls, applies the
// read rules from the Supabase RLS policies, and routes every write through Store.commit,
// which records it in the durable outbox for later replay to Supabase.
import { applyDefaults, pkOf, PRIMARY_KEYS, resolveRelation, UNIQUE_LOWER } from './schema';

export type Row = Record<string, any>;
export interface Write { table: string; op: 'upsert' | 'delete'; pk: string; data: Row | null; prev: Row | null }
export interface MediaObject { path: string; contentType: string; bytes: Uint8Array }
export interface Store {
  load(table: string): Promise<Row[]>;
  commit(writes: Write[], actor: string | null): Promise<void>;
  putMedia(obj: MediaObject, actor: string | null): Promise<void>;
  listMedia(prefix: string): Promise<string[]>;
  removeMedia(paths: string[], actor: string | null): Promise<void>;
}
export interface Ctx { store: Store; actor: string | null; admin: boolean; now?: () => string; actorForLog?: () => Promise<string | null> }
const logActor = async (ctx: Ctx) => (ctx.actorForLog ? await ctx.actorForLog() : ctx.actor);

export interface PgError { message: string; code: string; details: string | null; hint: string | null }
const err = (message: string, code = 'STAGING'): PgError => ({ message, code, details: null, hint: null });

// ---------- select parsing ----------

type FieldT = { kind: 'star' } | { kind: 'col'; name: string; alias: string } | { kind: 'embed'; table: string; alias: string; hint?: string; inner: boolean; fields: FieldT[] };

function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(s: string): FieldT[] {
  return splitTop(s.replace(/\s+/g, ' ')).map((part): FieldT => {
    if (part === '*') return { kind: 'star' };
    const paren = part.indexOf('(');
    if (paren >= 0) {
      const head = part.slice(0, paren).trim();
      const body = part.slice(paren + 1, part.lastIndexOf(')'));
      let alias: string | undefined; let rest = head;
      if (head.includes(':')) [alias, rest] = head.split(':').map((x) => x.trim());
      const [table, ...mods] = rest.split('!').map((x) => x.trim());
      const inner = mods.includes('inner');
      const hint = mods.find((m) => m !== 'inner' && m !== 'left');
      return { kind: 'embed', table, alias: alias ?? table, hint, inner, fields: parseSelect(body) };
    }
    if (part.includes(':')) { const [alias, name] = part.split(':').map((x) => x.trim()); return { kind: 'col', name, alias }; }
    return { kind: 'col', name: part, alias: part };
  });
}

// ---------- RLS (read) ----------
interface Lookup { recipes: () => Promise<Map<string, Row>> }
function makeLookup(ctx: Ctx): Lookup {
  let cache: Promise<Map<string, Row>> | null = null;
  return { recipes: () => (cache ??= ctx.store.load('recipes').then((rs) => new Map(rs.map((r) => [r.id, r])))) };
}
const recipeVisible = (r: Row | undefined, uid: string | null) => !!r && (r.visibility === 'family' || r.owner_id === uid);

async function visible(ctx: Ctx, lk: Lookup, table: string, row: Row): Promise<boolean> {
  if (ctx.admin) return true;
  const uid = ctx.actor;
  if (!uid) return false;
  switch (table) {
    case 'recipes': return recipeVisible(row, uid);
    case 'recipe_photos': case 'recipe_categories': case 'recipe_tags': case 'ratings':
      return recipeVisible((await lk.recipes()).get(row.recipe_id), uid);
    case 'recipe_translations': case 'recipe_title_i18n': return (await lk.recipes()).has(row.recipe_id);
    case 'comments':
      return (row.visibility === 'everyone' || row.author_id === uid) && recipeVisible((await lk.recipes()).get(row.recipe_id), uid);
    case 'favorites': case 'push_subscriptions': case 'timer_reminders': return row.user_id === uid;
    case 'family_invites': case 'client_events': case 'ai_usage': return false;
    default: return true;
  }
}

// Write rules (subset of the RLS with-check policies that matter for a family app).
async function mayWrite(ctx: Ctx, lk: Lookup, table: string, row: Row): Promise<boolean> {
  if (ctx.admin) return true;
  const uid = ctx.actor;
  if (!uid) return false;
  switch (table) {
    case 'profiles': return row.id === uid;
    case 'recipes': return row.owner_id === uid;
    case 'recipe_categories': case 'recipe_tags': return (await lk.recipes()).get(row.recipe_id)?.owner_id === uid;
    case 'recipe_photos': return recipeVisible((await lk.recipes()).get(row.recipe_id), uid);
    case 'comments': return row.author_id === uid;
    case 'favorites': case 'ratings': case 'push_subscriptions': case 'timer_reminders': case 'cook_logs': return row.user_id === uid;
    case 'client_events': return row.user_id == null || row.user_id === uid;
    default: return true;
  }
}

// ---------- filters ----------
type Filter = { col: string; test: (v: any) => boolean };
const same = (a: any, b: any) => a === b || (a != null && b != null && String(a) === String(b));
function getPath(row: Row, col: string): any {
  if (!col.includes('.')) return row[col];
  const [head, ...rest] = col.split('.');
  const v = row[head];
  if (Array.isArray(v)) return v.map((x) => getPath(x ?? {}, rest.join('.')));
  return v == null ? undefined : getPath(v, rest.join('.'));
}
function cmp(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a), nb = Number(b);
  if (typeof a !== 'boolean' && a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && /^-?\d/.test(String(a)) && !/^\d{4}-\d\d-\d\d/.test(String(a))) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// ---------- the builder ----------
type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
export interface Result<T = any> { data: T; error: PgError | null; count: number | null; status: number; statusText: string }

export class StagingQuery implements PromiseLike<Result> {
  private mode: Mode = 'select';
  private fields: FieldT[] = [{ kind: 'star' }];
  private returning = false;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private lim: number | null = null;
  private off = 0;
  private one: 'single' | 'maybe' | null = null;
  private countMode: string | null = null;
  private head = false;
  private payload: Row[] = [];
  private patch: Row = {};
  private onConflict: string[] | null = null;
  private ignoreDuplicates = false;

  constructor(private ctx: Ctx, private table: string) {
    if (!PRIMARY_KEYS[table]) throw new Error(`staging: unknown table ${table}`);
  }

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    this.fields = parseSelect(cols);
    if (this.mode !== 'select') this.returning = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.mode = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ? opts.onConflict.split(',').map((x) => x.trim()) : null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates; return this;
  }
  update(patch: Row) { this.mode = 'update'; this.patch = patch; return this; }
  delete() { this.mode = 'delete'; return this; }

  eq(col: string, v: any) { this.filters.push({ col, test: (x) => (Array.isArray(x) ? x.some((y) => same(y, v)) : same(x, v)) }); return this; }
  neq(col: string, v: any) { this.filters.push({ col, test: (x) => !same(x, v) }); return this; }
  in(col: string, vs: any[]) { this.filters.push({ col, test: (x) => vs.some((v) => same(x, v)) }); return this; }
  is(col: string, v: any) { this.filters.push({ col, test: (x) => (v === null ? x == null : x === v) }); return this; }
  gt(col: string, v: any) { this.filters.push({ col, test: (x) => x != null && cmp(x, v) > 0 }); return this; }
  gte(col: string, v: any) { this.filters.push({ col, test: (x) => x != null && cmp(x, v) >= 0 }); return this; }
  lt(col: string, v: any) { this.filters.push({ col, test: (x) => x != null && cmp(x, v) < 0 }); return this; }
  lte(col: string, v: any) { this.filters.push({ col, test: (x) => x != null && cmp(x, v) <= 0 }); return this; }
  ilike(col: string, pattern: string) {
    const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'is');
    this.filters.push({ col, test: (x) => x != null && re.test(String(x)) }); return this;
  }
  like(col: string, pattern: string) { return this.ilike(col, pattern); }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (!opts?.foreignTable && !opts?.referencedTable) this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.off = from; this.lim = to - from + 1; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }

  private now() { return this.ctx.now ? this.ctx.now() : new Date().toISOString(); }

  private async embed(lk: Lookup, table: string, rows: Row[], fields: FieldT[]): Promise<Row[]> {
    const embeds = fields.filter((f): f is Extract<FieldT, { kind: 'embed' }> => f.kind === 'embed');
    if (!embeds.length) return rows;
    let out = rows.map((r) => ({ ...r }));
    for (const e of embeds) {
      const rel = resolveRelation(table, e.table, e.hint);
      const targetRows: Row[] = [];
      for (const r of await this.ctx.store.load(rel.target)) if (await visible(this.ctx, lk, rel.target, r)) targetRows.push(r);
      const withNested = await this.embed(lk, rel.target, targetRows, e.fields);
      out = out.map((r) => {
        if (rel.kind === 'one') {
          const hit = withNested.find((t) => same(t[rel.foreign], r[rel.local])) ?? null;
          return { ...r, [e.alias]: hit ? project(hit, e.fields) : null };
        }
        return { ...r, [e.alias]: withNested.filter((t) => same(t[rel.foreign], r[rel.local])).map((t) => project(t, e.fields)) };
      });
      if (e.inner) out = out.filter((r) => (Array.isArray(r[e.alias]) ? r[e.alias].length > 0 : r[e.alias] != null));
    }
    return out;
  }

  private async matching(lk: Lookup, forWrite: boolean): Promise<Row[]> {
    const all = await this.ctx.store.load(this.table);
    const rows: Row[] = [];
    for (const r of all) {
      if (!(await visible(this.ctx, lk, this.table, r))) continue;
      if (forWrite && !(await mayWrite(this.ctx, lk, this.table, r))) continue;
      rows.push(r);
    }
    const direct = this.filters.filter((f) => !f.col.includes('.'));
    return rows.filter((r) => direct.every((f) => f.test(r[f.col])));
  }

  private async shape(lk: Lookup, rows: Row[], applyPaging: boolean): Promise<Result> {
    let out = await this.embed(lk, this.table, rows, this.fields);
    const dotted = this.filters.filter((f) => f.col.includes('.'));
    out = out.filter((r) => dotted.every((f) => f.test(getPath(r, f.col))));
    for (const o of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const va = getPath(a, o.col), vb = getPath(b, o.col);
        if (va == null || vb == null) {
          if (va == null && vb == null) return 0;
          const nullsFirst = o.nullsFirst ?? !o.asc;
          return (va == null ? -1 : 1) * (nullsFirst ? 1 : -1);
        }
        return o.asc ? cmp(va, vb) : -cmp(va, vb);
      });
    }
    const count = this.countMode ? out.length : null;
    if (applyPaging) {
      if (this.off) out = out.slice(this.off);
      if (this.lim != null) out = out.slice(0, this.lim);
    }
    const data = out.map((r) => project(r, this.fields));
    if (this.head) return { data: null, error: null, count, status: 200, statusText: 'OK' };
    if (this.one) {
      if (data.length > 1) return { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116'), count, status: 406, statusText: 'Not Acceptable' };
      if (!data.length) return this.one === 'single'
        ? { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116'), count, status: 406, statusText: 'Not Acceptable' }
        : { data: null, error: null, count, status: 200, statusText: 'OK' };
      return { data: data[0], error: null, count, status: 200, statusText: 'OK' };
    }
    return { data, error: null, count, status: 200, statusText: 'OK' };
  }

  private async run(): Promise<Result> {
    try {
      const lk = makeLookup(this.ctx);
      if (this.mode === 'select') return await this.shape(lk, await this.matching(lk, false), true);
      const writes: Write[] = [];
      const affected: Row[] = [];
      const now = this.now();
      const existing = await this.ctx.store.load(this.table);
      const byPk = new Map(existing.map((r) => [pkOf(this.table, r), r]));

      if (this.mode === 'insert' || this.mode === 'upsert') {
        const conflictCols = this.onConflict ?? PRIMARY_KEYS[this.table];
        for (const raw of this.payload) {
          const prevRow = this.mode === 'upsert' ? existing.find((r) => conflictCols.every((c) => same(r[c], raw[c]))) : undefined;
          if (prevRow && this.ignoreDuplicates) continue;
          let row = prevRow ? { ...prevRow, ...raw } : applyDefaults(this.table, raw, now);
          row = await this.triggers(row, prevRow ?? null, now);
          const pk = pkOf(this.table, row);
          if (!prevRow && byPk.has(pk)) return this.fail(err(`duplicate key value violates unique constraint "${this.table}_pkey"`, '23505'), 409);
          const dup = this.uniqueClash(existing, row, prevRow);
          if (dup) return this.fail(err(`duplicate key value violates unique constraint "${this.table}_${dup}_idx"`, '23505'), 409);
          if (!(await mayWrite(this.ctx, lk, this.table, row))) return this.fail(err(`new row violates row-level security policy for table "${this.table}"`, '42501'), 403);
          writes.push({ table: this.table, op: 'upsert', pk, data: row, prev: prevRow ?? null });
          affected.push(row);
          existing.push(row);
          byPk.set(pk, row);
        }
      } else if (this.mode === 'update') {
        for (const r of await this.matching(lk, true)) {
          let row = { ...r, ...this.patch };
          row = await this.triggers(row, r, now);
          const dup = this.uniqueClash(existing, row, r);
          if (dup) return this.fail(err(`duplicate key value violates unique constraint "${this.table}_${dup}_idx"`, '23505'), 409);
          writes.push({ table: this.table, op: 'upsert', pk: pkOf(this.table, r), data: row, prev: r });
          affected.push(row);
        }
      } else if (this.mode === 'delete') {
        for (const r of await this.matching(lk, true)) {
          writes.push({ table: this.table, op: 'delete', pk: pkOf(this.table, r), data: null, prev: r });
          affected.push(r);
          await this.cascade(r, writes);
        }
      }
      if (writes.length) await this.ctx.store.commit(writes, await logActor(this.ctx));
      if (!this.returning) {
        const count = this.countMode ? affected.length : null;
        return { data: null, error: null, count, status: this.mode === 'insert' ? 201 : 204, statusText: 'OK' };
      }
      return await this.shape(lk, affected, false);
    } catch (e: any) {
      return this.fail(err(String(e?.message ?? e)), 500);
    }
  }

  private fail(error: PgError, status: number): Result { return { data: null, error, count: null, status, statusText: 'Error' }; }

  private uniqueClash(existing: Row[], row: Row, prev: Row | undefined): string | null {
    for (const col of UNIQUE_LOWER[this.table] ?? []) {
      const v = row[col];
      if (v == null) continue;
      const pk = pkOf(this.table, row);
      if (existing.some((r) => r !== prev && pkOf(this.table, r) !== pk && r[col] != null && String(r[col]).toLowerCase() === String(v).toLowerCase())) return col;
    }
    return null;
  }

  // Mirrors the Postgres triggers that matter for correctness.
  private async triggers(row: Row, prev: Row | null, now: string): Promise<Row> {
    if (this.table !== 'recipes') return row;
    const [rt, tags] = await Promise.all([this.ctx.store.load('recipe_tags'), this.ctx.store.load('tags')]);
    const tagNames = rt.filter((x) => x.recipe_id === row.id).map((x) => tags.find((t) => t.id === x.tag_id)?.name).filter(Boolean);
    const ingredients = Array.isArray(row.ingredients) ? row.ingredients.map((i: any) => i?.name ?? '').filter(Boolean) : [];
    row.search_text = [row.title ?? '', row.description ?? '', row.credit ?? '', ingredients.join(' '), tagNames.join(' ')].join(' ').toLowerCase();
    row.updated_at = now;
    void prev;
    return row;
  }

  private async cascade(parent: Row, writes: Write[]) {
    const children: Record<string, [string, string][]> = {
      recipes: [['recipe_photos', 'recipe_id'], ['recipe_categories', 'recipe_id'], ['recipe_tags', 'recipe_id'], ['comments', 'recipe_id'],
        ['favorites', 'recipe_id'], ['ratings', 'recipe_id'], ['recipe_translations', 'recipe_id'], ['recipe_title_i18n', 'recipe_id'], ['cook_logs', 'recipe_id']],
      categories: [['recipe_categories', 'category_id']],
      tags: [['recipe_tags', 'tag_id']],
    };
    for (const [child, col] of children[this.table] ?? []) {
      for (const r of await this.ctx.store.load(child)) {
        if (same(r[col], parent.id)) writes.push({ table: child, op: 'delete', pk: pkOf(child, r), data: null, prev: r });
      }
    }
  }
}

function project(row: Row, fields: FieldT[]): Row {
  if (fields.some((f) => f.kind === 'star')) {
    const out: Row = { ...row };
    for (const f of fields) if (f.kind === 'col' && f.alias !== f.name) out[f.alias] = row[f.name];
    return out;
  }
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === 'col') out[f.alias] = row[f.name] ?? null;
    else if (f.kind === 'embed') out[f.alias] = row[f.alias];
  }
  return out;
}

// ---------- rpc / storage ----------
export async function rpc(ctx: Ctx, fn: string, args: Row): Promise<Result> {
  if (fn !== 'bump_ai_usage') return { data: null, error: err(`rpc ${fn} not available in staging`), count: null, status: 404, statusText: 'Not Found' };
  const day = new Date().toISOString().slice(0, 10);
  const rows = await ctx.store.load('ai_usage');
  const prev = rows.find((r) => r.day === day) ?? null;
  const count = Number(prev?.count ?? 0) + 1;
  const row = { day, count };
  await ctx.store.commit([{ table: 'ai_usage', op: 'upsert', pk: day, data: row, prev }], await logActor(ctx));
  return { data: count <= Number(args.daily_limit ?? 500), error: null, count: null, status: 200, statusText: 'OK' };
}

export function storageBucket(ctx: Ctx, bucket: string) {
  const full = (p: string) => `${bucket}/${p}`;
  return {
    async upload(path: string, body: Blob | ArrayBuffer | Uint8Array, opts?: { contentType?: string }) {
      try {
        const bytes = body instanceof Uint8Array ? body : body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(await (body as Blob).arrayBuffer());
        await ctx.store.putMedia({ path: full(path), contentType: opts?.contentType ?? 'application/octet-stream', bytes }, await logActor(ctx));
        return { data: { path }, error: null };
      } catch (e: any) { return { data: null, error: err(String(e?.message ?? e)) }; }
    },
    async list(prefix: string, _opts?: { limit?: number }) {
      const paths = await ctx.store.listMedia(full(prefix.replace(/\/$/, '')) + '/');
      return { data: paths.map((p) => ({ name: p.split('/').pop()! })), error: null };
    },
    async remove(paths: string[]) {
      await ctx.store.removeMedia(paths.map(full), await logActor(ctx));
      return { data: paths.map((name) => ({ name })), error: null };
    },
    getPublicUrl(path: string) { return { data: { publicUrl: '/api/staging/media/' + path.split('/').map(encodeURIComponent).join('/') } }; },
  };
}
