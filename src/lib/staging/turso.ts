/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
// Minimal libSQL (Hrana v2 over HTTP) client for the temporary Turso bridge. No SDK needed.
import type { MediaObject, Row, Store, Write } from './engine';

type Val = { type: 'null' } | { type: 'text'; value: string } | { type: 'integer'; value: string } | { type: 'float'; value: number } | { type: 'blob'; base64: string };
interface Stmt { sql: string; args?: Val[] }
const v = (x: unknown): Val => (x == null ? { type: 'null' } : typeof x === 'number' && Number.isInteger(x) ? { type: 'integer', value: String(x) } : { type: 'text', value: typeof x === 'string' ? x : JSON.stringify(x) });

function endpoint() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) throw new Error('staging: TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing');
  return { base: url.replace(/^libsql:\/\//, 'https://').replace(/\/$/, ''), token };
}

async function pipeline(requests: unknown[]): Promise<any[]> {
  const { base, token } = endpoint();
  const res = await fetch(base + '/v2/pipeline', {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  });
  if (!res.ok) throw new Error(`staging: turso HTTP ${res.status}`);
  const j = await res.json();
  return j.results.slice(0, -1);
}

export async function query(sql: string, args: unknown[] = []): Promise<Row[]> {
  const [r] = await pipeline([{ type: 'execute', stmt: { sql, args: args.map(v) } }]);
  if (r.type !== 'ok') throw new Error('staging: ' + (r.error?.message ?? 'query failed'));
  const { cols, rows } = r.response.result;
  return rows.map((row: any[]) => Object.fromEntries(row.map((c, i) => [cols[i].name, c.type === 'null' ? null : c.type === 'blob' ? c.base64 : c.value])));
}

// Runs statements atomically: BEGIN, steps..., COMMIT; ROLLBACK if any step failed.
export async function atomic(stmts: Stmt[]): Promise<void> {
  const all: Stmt[] = [{ sql: 'BEGIN IMMEDIATE' }, ...stmts, { sql: 'COMMIT' }];
  const steps: any[] = all.map((stmt, i) => ({ stmt, ...(i ? { condition: { type: 'ok', step: i - 1 } } : {}) }));
  steps.push({ stmt: { sql: 'ROLLBACK' }, condition: { type: 'not', cond: { type: 'ok', step: all.length - 1 } } });
  const [r] = await pipeline([{ type: 'batch', batch: { steps } }]);
  if (r.type !== 'ok') throw new Error('staging: ' + (r.error?.message ?? 'batch failed'));
  const res = r.response.result;
  const failed = res.step_errors.findIndex((e: any, i: number) => e && i < all.length);
  if (failed >= 0 || !res.step_results[all.length - 1]) throw new Error('staging: write failed: ' + (res.step_errors[failed]?.message ?? 'not committed'));
}

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS fr_rows(tbl TEXT NOT NULL, pk TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, origin TEXT NOT NULL, PRIMARY KEY(tbl, pk))`,
  `CREATE TABLE IF NOT EXISTS fr_tombstones(tbl TEXT NOT NULL, pk TEXT NOT NULL, deleted_at TEXT NOT NULL, actor TEXT, prev TEXT, PRIMARY KEY(tbl, pk))`,
  `CREATE TABLE IF NOT EXISTS fr_outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, tbl TEXT NOT NULL, op TEXT NOT NULL, pk TEXT NOT NULL, data TEXT, prev TEXT, replayed_at TEXT, replay_result TEXT)`,
  `CREATE TABLE IF NOT EXISTS fr_media(path TEXT PRIMARY KEY, content_type TEXT NOT NULL, b64 TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, actor TEXT, created_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS fr_meta(k TEXT PRIMARY KEY, v TEXT)`,
];

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
async function sha256(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Buffer.from(d).toString('hex');
}

export class TursoStore implements Store {
  private memo = new Map<string, Promise<Row[]>>();

  load(table: string): Promise<Row[]> {
    let p = this.memo.get(table);
    if (!p) {
      p = query('SELECT data FROM fr_rows WHERE tbl = ?', [table]).then((rs) => rs.map((r) => JSON.parse(r.data as string)));
      this.memo.set(table, p);
      p.catch(() => this.memo.delete(table));
    }
    return p.then((rows) => rows.map((r) => ({ ...r })));
  }

  async commit(writes: Write[], actor: string | null): Promise<void> {
    const at = new Date().toISOString();
    const stmts: Stmt[] = [];
    for (const w of writes) {
      if (w.op === 'upsert') {
        stmts.push({ sql: `INSERT INTO fr_rows(tbl, pk, data, updated_at, origin) VALUES(?,?,?,?,'staging') ON CONFLICT(tbl, pk) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, origin='staging'`, args: [v(w.table), v(w.pk), v(JSON.stringify(w.data)), v(at)] });
        stmts.push({ sql: 'DELETE FROM fr_tombstones WHERE tbl=? AND pk=?', args: [v(w.table), v(w.pk)] });
      } else {
        stmts.push({ sql: 'DELETE FROM fr_rows WHERE tbl=? AND pk=?', args: [v(w.table), v(w.pk)] });
        stmts.push({ sql: `INSERT INTO fr_tombstones(tbl, pk, deleted_at, actor, prev) VALUES(?,?,?,?,?) ON CONFLICT(tbl, pk) DO UPDATE SET deleted_at=excluded.deleted_at, actor=excluded.actor, prev=excluded.prev`, args: [v(w.table), v(w.pk), v(at), v(actor), v(JSON.stringify(w.prev))] });
      }
      stmts.push({ sql: 'INSERT INTO fr_outbox(at, actor, tbl, op, pk, data, prev) VALUES(?,?,?,?,?,?,?)', args: [v(at), v(actor), v(w.table), v(w.op), v(w.pk), v(w.data ? JSON.stringify(w.data) : null), v(w.prev ? JSON.stringify(w.prev) : null)] });
    }
    await atomic(stmts);
    this.memo.clear();
  }

  async putMedia(obj: MediaObject, actor: string | null): Promise<void> {
    const at = new Date().toISOString();
    const hash = await sha256(obj.bytes);
    await atomic([
      { sql: `INSERT INTO fr_media(path, content_type, b64, size, sha256, actor, created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET content_type=excluded.content_type, b64=excluded.b64, size=excluded.size, sha256=excluded.sha256, actor=excluded.actor, created_at=excluded.created_at, deleted_at=NULL`, args: [v(obj.path), v(obj.contentType), v(b64(obj.bytes)), v(obj.bytes.length), v(hash), v(actor), v(at)] },
      { sql: 'INSERT INTO fr_outbox(at, actor, tbl, op, pk, data) VALUES(?,?,?,?,?,?)', args: [v(at), v(actor), v('storage'), v('upload'), v(obj.path), v(JSON.stringify({ contentType: obj.contentType, size: obj.bytes.length, sha256: hash }))] },
    ]);
  }

  async listMedia(prefix: string): Promise<string[]> {
    const rows = await query('SELECT path FROM fr_media WHERE deleted_at IS NULL AND substr(path, 1, ?) = ?', [prefix.length, prefix]);
    return rows.map((r) => r.path as string);
  }

  async removeMedia(paths: string[], actor: string | null): Promise<void> {
    if (!paths.length) return;
    const at = new Date().toISOString();
    const stmts: Stmt[] = [];
    for (const p of paths) {
      stmts.push({ sql: 'UPDATE fr_media SET deleted_at=? WHERE path=?', args: [v(at), v(p)] });
      stmts.push({ sql: 'INSERT INTO fr_outbox(at, actor, tbl, op, pk) VALUES(?,?,?,?,?)', args: [v(at), v(actor), v('storage'), v('remove'), v(p)] });
    }
    await atomic(stmts);
  }
}

export async function getMedia(path: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  const rows = await query('SELECT content_type, b64 FROM fr_media WHERE path=? AND deleted_at IS NULL', [path]);
  if (!rows.length) return null;
  return { contentType: rows[0].content_type as string, bytes: Buffer.from(rows[0].b64 as string, 'base64') };
}

// One-time seed from the verified Sep 18 snapshot already stored in backup_rows.
export async function ensureSchemaAndSeed(): Promise<{ seeded: boolean; rows: number; perTable: Record<string, number> }> {
  await atomic(SCHEMA.map((sql) => ({ sql })));
  const meta = await query(`SELECT v FROM fr_meta WHERE k='seeded_at'`);
  const counts = await query('SELECT tbl, count(*) AS n FROM fr_rows GROUP BY tbl');
  const perTable = Object.fromEntries(counts.map((r) => [r.tbl as string, Number(r.n)]));
  if (meta.length) return { seeded: false, rows: Object.values(perTable).reduce((a, b) => a + b, 0), perTable };
  const { pkOf, normalizeSnapshotRow } = await import('./schema');
  const src = await query('SELECT table_name, row_id, data FROM backup_rows');
  const at = new Date().toISOString();
  const stmts: Stmt[] = src.map((r) => {
    const data = normalizeSnapshotRow(r.table_name as string, JSON.parse(r.data as string));
    return { sql: `INSERT OR IGNORE INTO fr_rows(tbl, pk, data, updated_at, origin) VALUES(?,?,?,?,'snapshot')`, args: [v(r.table_name), v(pkOf(r.table_name as string, data)), v(JSON.stringify(data)), v(at)] };
  });
  stmts.push({ sql: `INSERT INTO fr_meta(k, v) VALUES('seeded_at', ?)`, args: [v(at)] });
  stmts.push({ sql: `INSERT INTO fr_meta(k, v) VALUES('seed_source', 'backup_rows (Sep 18 verified snapshot)')` });
  await atomic(stmts);
  const after = await query('SELECT tbl, count(*) AS n FROM fr_rows GROUP BY tbl');
  const pt = Object.fromEntries(after.map((r) => [r.tbl as string, Number(r.n)]));
  return { seeded: true, rows: Object.values(pt).reduce((a, b) => a + b, 0), perTable: pt };
}
