#!/usr/bin/env node
// Replays the Turso staging outbox into Supabase (the permanent home).
// Default is a DRY RUN that prints the plan. Pass --apply to write.
// Rule: per (table, pk) the last change in the outbox wins, but a Supabase row whose updated_at is
// newer than that change (e.g. an edit made directly in production) is never overwritten - it is
// reported as a conflict instead.
// Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply');
const PK = {
  profiles: ['id'], recipes: ['id'], recipe_photos: ['id'], categories: ['id'], recipe_categories: ['recipe_id', 'category_id'], tags: ['id'],
  recipe_tags: ['recipe_id', 'tag_id'], comments: ['id'], favorites: ['user_id', 'recipe_id'], ratings: ['user_id', 'recipe_id'], ai_usage: ['day'],
  app_settings: ['id'], recipe_translations: ['recipe_id', 'locale'], push_subscriptions: ['endpoint'], timer_reminders: ['id'],
  recipe_title_i18n: ['recipe_id', 'locale'], cook_logs: ['id'], family_invites: ['token'], client_events: ['id'],
};
// Parents first on upsert, children first on delete.
const ORDER = ['profiles', 'categories', 'tags', 'recipes', 'recipe_photos', 'recipe_categories', 'recipe_tags', 'comments', 'favorites', 'ratings',
  'recipe_translations', 'recipe_title_i18n', 'cook_logs', 'timer_reminders', 'push_subscriptions', 'family_invites', 'app_settings', 'ai_usage', 'client_events'];

const turso = process.env.TURSO_DATABASE_URL.replace(/^libsql:\/\//, 'https://');
async function tq(sql, args = []) {
  const r = await fetch(turso + '/v2/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${process.env.TURSO_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: args.map((a) => (a == null ? { type: 'null' } : { type: 'text', value: String(a) })) } }, { type: 'close' }] }) });
  const j = await r.json(); const x = j.results[0];
  if (x.type !== 'ok') throw new Error(x.error.message);
  const { cols, rows } = x.response.result;
  return rows.map((row) => Object.fromEntries(row.map((c, i) => [cols[i].name, c.type === 'null' ? null : c.value])));
}
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const filt = (t, row) => PK[t].map((c) => `${c}=eq.${encodeURIComponent(row[c])}`).join('&');

const entries = await tq('SELECT seq, at, tbl, op, pk, data, prev FROM fr_outbox WHERE replayed_at IS NULL ORDER BY seq');
const last = new Map();
for (const e of entries) last.set(`${e.tbl}|${e.pk}`, e);
const plan = [...last.values()].sort((a, b) => {
  const oa = ORDER.indexOf(a.tbl), ob = ORDER.indexOf(b.tbl);
  if (a.op === 'delete' && b.op === 'delete') return ob - oa;
  if (a.op !== b.op) return a.op === 'delete' ? 1 : -1;
  return oa - ob || Number(a.seq) - Number(b.seq);
});
console.log(`${entries.length} outbox entries -> ${plan.length} final changes${APPLY ? '' : ' (dry run)'}`);
const report = { applied: 0, conflicts: [], failed: [] };
for (const e of plan) {
  const data = e.data ? JSON.parse(e.data) : null;
  const prev = e.prev ? JSON.parse(e.prev) : null;
  if (e.tbl === 'storage') {
    console.log(`storage ${e.op} ${e.pk}`);
    if (!APPLY) continue;
    const path = e.pk.replace(/^photos\//, '');
    if (e.op === 'upload') {
      const [m] = await tq('SELECT content_type, b64 FROM fr_media WHERE path=?', [e.pk]);
      if (!m) { report.failed.push([e.seq, 'media bytes missing']); continue; }
      const r = await fetch(`${SB}/storage/v1/object/photos/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': m.content_type, 'x-upsert': 'true' }, body: Buffer.from(m.b64, 'base64') });
      if (!r.ok) { report.failed.push([e.seq, `upload ${r.status}`]); continue; }
    } else {
      await fetch(`${SB}/storage/v1/object/photos`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: [path] }) });
    }
  } else {
    const key = data ?? prev;
    const cur = await fetch(`${SB}/rest/v1/${e.tbl}?${filt(e.tbl, key)}&select=*`, { headers: H }).then((r) => r.json());
    const live = Array.isArray(cur) ? cur[0] : null;
    if (live?.updated_at && new Date(live.updated_at) > new Date(e.at)) { report.conflicts.push({ seq: e.seq, tbl: e.tbl, pk: e.pk, live: live.updated_at, staged: e.at }); continue; }
    console.log(`${e.tbl} ${e.op} ${e.pk}`);
    if (!APPLY) continue;
    const r = e.op === 'delete'
      ? await fetch(`${SB}/rest/v1/${e.tbl}?${filt(e.tbl, key)}`, { method: 'DELETE', headers: H })
      : await fetch(`${SB}/rest/v1/${e.tbl}?on_conflict=${PK[e.tbl].join(',')}`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(data) });
    if (!r.ok) { report.failed.push([e.seq, `${r.status} ${await r.text()}`]); continue; }
  }
  report.applied++;
}
if (APPLY) {
  const failedSeqs = new Set(report.failed.map((f) => String(f[0])));
  const conflictKeys = new Set(report.conflicts.map((c) => `${c.tbl}|${c.pk}`));
  const at = new Date().toISOString();
  for (const e of entries) {
    const k = `${e.tbl}|${e.pk}`;
    const fin = last.get(k);
    if (failedSeqs.has(String(fin.seq)) || conflictKeys.has(k)) continue;
    await tq('UPDATE fr_outbox SET replayed_at=?, replay_result=? WHERE seq=?', [at, fin.seq === e.seq ? 'applied' : 'superseded', e.seq]);
  }
}
console.log(JSON.stringify(report, null, 2));
