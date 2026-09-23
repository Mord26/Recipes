/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { stagingTurso } from '@/lib/staging/backend';
import { createStagingServerClient } from '@/lib/staging/server-client';
import { query } from '@/lib/staging/turso';

export const runtime = 'nodejs';

// QA view of the bridge: row counts, outbox depth, tombstones and media awaiting replay.
export async function GET() {
  if (!stagingTurso()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const client = await createStagingServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [rows, outbox, pending, tomb, media, meta, recent] = await Promise.all([
    query('SELECT tbl, origin, count(*) AS n FROM fr_rows GROUP BY tbl, origin ORDER BY tbl'),
    query('SELECT count(*) AS n FROM fr_outbox'),
    query('SELECT count(*) AS n FROM fr_outbox WHERE replayed_at IS NULL'),
    query('SELECT count(*) AS n FROM fr_tombstones'),
    query('SELECT count(*) AS n, coalesce(sum(size),0) AS bytes FROM fr_media WHERE deleted_at IS NULL'),
    query('SELECT k, v FROM fr_meta'),
    query('SELECT seq, at, actor, tbl, op, pk FROM fr_outbox ORDER BY seq DESC LIMIT 20'),
  ]);
  return NextResponse.json({ backend: 'turso', rows, outbox: outbox[0], pendingReplay: pending[0], tombstones: tomb[0], media: media[0], meta, recent });
}
