import { NextResponse, type NextRequest } from 'next/server';
import { stagingTurso } from '@/lib/staging/backend';
import { createStagingServerClient } from '@/lib/staging/server-client';

export const runtime = 'nodejs';
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!stagingTurso()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const client = await createStagingServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const bucket = request.headers.get('x-bucket') ?? '';
  const path = decodeURIComponent(request.headers.get('x-path') ?? '');
  if (bucket !== 'photos' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path)) return NextResponse.json({ error: 'bad path' }, { status: 400 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return NextResponse.json({ error: 'bad size' }, { status: 413 });
  const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType: request.headers.get('content-type') ?? 'image/webp' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path });
}
