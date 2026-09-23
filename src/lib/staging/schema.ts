// Table metadata for the temporary Turso bridge. Mirrors supabase/migrations so the
// staging query engine can apply primary keys, defaults, unique rules and embeds.
export const PRIMARY_KEYS: Record<string, string[]> = {
  profiles: ['id'], recipes: ['id'], recipe_photos: ['id'], categories: ['id'],
  recipe_categories: ['recipe_id', 'category_id'], tags: ['id'], recipe_tags: ['recipe_id', 'tag_id'],
  comments: ['id'], favorites: ['user_id', 'recipe_id'], ratings: ['user_id', 'recipe_id'],
  ai_usage: ['day'], app_settings: ['id'], recipe_translations: ['recipe_id', 'locale'],
  push_subscriptions: ['endpoint'], timer_reminders: ['id'], recipe_title_i18n: ['recipe_id', 'locale'],
  cook_logs: ['id'], family_invites: ['token'], client_events: ['id'],
};

export const TABLES = Object.keys(PRIMARY_KEYS);

// Case-insensitive unique columns (partial unique indexes in Postgres).
export const UNIQUE_LOWER: Record<string, string[]> = {
  profiles: ['username'], categories: ['name_he', 'name_en'], tags: ['name'],
};

const UUID_TABLES = new Set(['recipes', 'recipe_photos', 'categories', 'tags', 'comments', 'timer_reminders', 'cook_logs', 'client_events']);

export function applyDefaults(table: string, row: Record<string, unknown>, now: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  if (UUID_TABLES.has(table) && out.id == null) out.id = crypto.randomUUID();
  const withCreated = !['recipe_categories', 'recipe_tags', 'ai_usage', 'app_settings'].includes(table);
  if (withCreated && out.created_at == null) out.created_at = now;
  const d: Record<string, Record<string, unknown>> = {
    profiles: { role: 'member', default_visibility: 'family', locale: 'he', unit_system: 'metric', blocked: false, can_add_recipes: true, notify_new_recipes: true },
    recipes: { description: '', ingredients: [], steps: [], visibility: 'family', source: 'manual', search_text: '', updated_at: now },
    recipe_photos: { kind: 'photo', position: 0 },
    comments: { visibility: 'everyone' },
    ai_usage: { count: 0 },
    app_settings: { id: 1, hide_ratings: false, hide_tags: false, updated_at: now },
    recipe_translations: { description: '' },
    timer_reminders: { sent: false, kind: 'timer' },
    client_events: { detail: {} },
  };
  for (const [k, v] of Object.entries(d[table] ?? {})) if (out[k] === undefined) out[k] = v;
  return out;
}

export function pkOf(table: string, row: Record<string, unknown>): string {
  const cols = PRIMARY_KEYS[table];
  if (!cols) throw new Error(`staging: unknown table ${table}`);
  return cols.map((c) => String(row[c] ?? '')).join('|');
}

// Embedded relation resolution for PostgREST-style select strings.
// kind 'one' = many-to-one (object), 'many' = one-to-many (array).
export interface Relation { target: string; kind: 'one' | 'many'; local: string; foreign: string }

const FK_HINTS: Record<string, Relation> = {
  recipes_owner_id_fkey: { target: 'profiles', kind: 'one', local: 'owner_id', foreign: 'id' },
  recipe_photos_uploader_id_fkey: { target: 'profiles', kind: 'one', local: 'uploader_id', foreign: 'id' },
  comments_author_id_fkey: { target: 'profiles', kind: 'one', local: 'author_id', foreign: 'id' },
};

const singular = (t: string) => (t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.endsWith('s') ? t.slice(0, -1) : t);

export function resolveRelation(source: string, target: string, hint?: string): Relation {
  if (hint && FK_HINTS[hint]) return FK_HINTS[hint];
  const srcFk = singular(target) + '_id';
  const tgtFk = singular(source) + '_id';
  const has = (table: string, col: string) => (PRIMARY_KEYS[table] ?? []).includes(col) || KNOWN_COLUMNS[table]?.includes(col);
  if (has(target, tgtFk)) return { target, kind: 'many', local: 'id', foreign: tgtFk };
  if (has(source, srcFk)) return { target, kind: 'one', local: srcFk, foreign: 'id' };
  throw new Error(`staging: cannot resolve relation ${source} -> ${target}`);
}

const KNOWN_COLUMNS: Record<string, string[]> = {
  recipe_photos: ['recipe_id', 'uploader_id'], recipe_categories: ['recipe_id'], recipe_tags: ['recipe_id'],
  ratings: ['recipe_id', 'user_id'], favorites: ['recipe_id', 'user_id'], comments: ['recipe_id', 'author_id'],
  cook_logs: ['recipe_id', 'user_id'], recipe_translations: ['recipe_id'], recipe_title_i18n: ['recipe_id'],
};

// The snapshot in backup_rows is a text export ('t'/'f', numbers and jsonb as strings,
// timestamps as '2026-07-27 16:33:34.68+00'). Normalize to what supabase-js would return.
const BOOL_COLS: Record<string, string[]> = {
  profiles: ['blocked', 'can_add_recipes', 'notify_new_recipes'], app_settings: ['hide_ratings', 'hide_tags'], timer_reminders: ['sent'],
};
const INT_COLS: Record<string, string[]> = {
  recipes: ['servings', 'prep_minutes', 'cook_minutes'], recipe_photos: ['position'], ratings: ['stars'], ai_usage: ['count'], app_settings: ['id'],
};
const JSON_COLS: Record<string, string[]> = {
  recipes: ['ingredients', 'steps'], recipe_translations: ['ingredients', 'steps'], client_events: ['detail'],
};
const TS_COLS = ['created_at', 'updated_at', 'fire_at', 'source_updated_at', 'expires_at', 'used_at'];

export function normalizeSnapshotRow(table: string, input: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = { ...input };
  for (const c of BOOL_COLS[table] ?? []) if (typeof row[c] === 'string') row[c] = row[c] === 't' || row[c] === 'true';
  for (const c of INT_COLS[table] ?? []) if (typeof row[c] === 'string' && row[c] !== '') row[c] = Number(row[c]);
  for (const c of JSON_COLS[table] ?? []) if (typeof row[c] === 'string') { try { row[c] = JSON.parse(row[c] as string); } catch { /* keep text */ } }
  for (const c of TS_COLS) {
    const s = row[c];
    if (typeof s === 'string' && /^\d{4}-\d\d-\d\d \d/.test(s)) row[c] = s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  }
  return row;
}
