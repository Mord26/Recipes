import { NextResponse, type NextRequest } from 'next/server';
import { stagingTurso } from '@/lib/staging/backend';
import { getMedia } from '@/lib/staging/turso';

export const runtime = 'nodejs';

// New photos live in Turso; photos from the Sep 18 snapshot are bundled under /fallback-media.
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!stagingTurso()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const parts = (await params).path.map((p) => decodeURIComponent(p));
  if (parts.some((p) => p === '..' || p.includes('/'))) return NextResponse.json({ error: 'bad path' }, { status: 400 });
  const rel = parts.join('/');
  const hit = await getMedia('photos/' + rel);
  if (hit) {
    return new NextResponse(new Uint8Array(hit.bytes), { headers: { 'content-type': hit.contentType, 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  return NextResponse.redirect(new URL('/fallback-media/' + parts.map(encodeURIComponent).join('/'), request.url), 307);
}
