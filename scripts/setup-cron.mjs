// Sets up (or refreshes) the per-minute pg_cron job that pings the timer dispatch endpoint.
// Usage: node scripts/setup-cron.mjs
// Requires env: SUPABASE_DB_URL, TIMER_DISPATCH_SECRET, DISPATCH_URL (defaults to prod).
import { Client } from 'pg';

const dbUrl = process.env.SUPABASE_DB_URL;
const secret = process.env.TIMER_DISPATCH_SECRET;
const dispatchUrl = process.env.DISPATCH_URL ?? 'https://hamitkonim.vercel.app/api/timers/dispatch';
if (!dbUrl) throw new Error('SUPABASE_DB_URL missing');
if (!secret) throw new Error('TIMER_DISPATCH_SECRET missing');

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('create extension if not exists pg_cron;');
  await client.query('create extension if not exists pg_net;');

  // Drop any previous version of the job so re-runs stay idempotent.
  await client.query(`select cron.unschedule('timer-dispatch') where exists (select 1 from cron.job where jobname = 'timer-dispatch');`);

  const command = `select net.http_post(
      url := '${dispatchUrl}',
      headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret', '${secret}')
    );`;

  await client.query(`select cron.schedule('timer-dispatch', '* * * * *', $job$${command}$job$);`);
  console.log('cron job timer-dispatch scheduled every minute ->', dispatchUrl);
} finally {
  await client.end();
}
