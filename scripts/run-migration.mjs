import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL missing');

const file = process.argv[2] ?? 'supabase/migrations/001_init.sql';
const sql = readFileSync(file, 'utf8');

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log(`migration ${file} applied`);
} finally {
  await client.end();
}
