import { NextResponse, type NextRequest } from 'next/server';
import { stagingTurso } from '@/lib/staging/backend';
import { ensureSchemaAndSeed } from '@/lib/staging/turso';

export const runtime = 'nodejs';

// Creates the bridge tables and seeds them once from the verified Sep 18 snapshot. Idempotent.
export async function POST(request: NextRequest) {
  if (!stagingTurso()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const secret = process.env.STAGING_PROFILE_SECRET;
  if (!secret || request.headers.get('x-staging-secret') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await ensureSchemaAndSeed());
}
