import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  extractRecipeFromText,
  extractRecipeFromVideo,
  GeminiBusyError,
  GeminiQuotaError,
} from '@/lib/gemini';
import { parseJsonLdRecipe, parseOgImage } from '@/lib/jsonld-recipe';
import { htmlToText, recipeToText } from '@/lib/page-text';
import { parseSharedUrl } from '@/lib/recipe-url';
import type { ExtractedRecipe } from '@/lib/types';

// Resolving a video, downloading it and having Gemini watch it adds up; the blog path is far faster.
export const maxDuration = 300;

const DAILY_AI_LIMIT = 500;
const PAGE_TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_BYTES = 18 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

// An honest identifier beats pretending to be Chrome: the pretence fails against TLS fingerprinting
// anyway, and this lets a site see exactly who asked.
const USER_AGENT =
  'Mozilla/5.0 (compatible; HamitkonimBot/1.0; +https://hamitkonim.vercel.app) FamilyRecipes personal recipe import';

interface ResolvedMedia {
  ok: boolean;
  error?: string;
  title?: string;
  description?: string;
  uploader?: string;
  thumbnail?: string;
  extractor?: string;
  video?: { url: string; ext: string; filesize: number | null; headers: Record<string, string> } | null;
}

type LogFn = (fields: Record<string, string | number | undefined>) => void;

/** Reads a response body but refuses to buffer more than the cap, whatever Content-Length claims. */
async function readCapped(response: Response, cap: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function fetchPage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const bytes = await readCapped(response, MAX_PAGE_BYTES);
  return bytes ? new TextDecoder('utf-8').decode(bytes) : null;
}

/**
 * Downloads the dish photo and hands it back inline, so the browser can run it through the
 * existing compress-and-upload path once the recipe is actually saved.
 */
async function fetchImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  const parsed = parseSharedUrl(url);
  if (!parsed) return null;
  const response = await fetch(parsed.url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  }).catch(() => null);
  if (!response || !response.ok) return null;

  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) return null;
  const bytes = await readCapped(response, MAX_IMAGE_BYTES);
  if (!bytes || bytes.length < 1024) return null;
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Asks the Python resolver what is actually behind a social link. */
async function resolveMedia(request: Request, url: string): Promise<ResolvedMedia> {
  const secret = process.env.MEDIA_RESOLVER_SECRET;
  if (!secret) return { ok: false, error: 'resolverUnavailable' };
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/media?url=${encodeURIComponent(url)}`, {
    headers: { 'x-resolver-secret': secret },
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response) return { ok: false, error: 'resolveFailed' };
  return (await response.json().catch(() => ({ ok: false, error: 'resolveFailed' }))) as ResolvedMedia;
}

type ImportSuccess = { recipe: ExtractedRecipe; image: string | null; credit: string | null };
type ImportFailure = { error: string; status: number };

async function importFromSocial(request: Request, url: string, log: LogFn): Promise<ImportSuccess | ImportFailure> {
  const media = await resolveMedia(request, url);
  if (!media.ok || !media.video?.url) {
    log({ stage: 'resolve', outcome: media.error ?? 'noVideo' });
    return { error: media.error === 'mediaUnavailable' ? 'mediaUnavailable' : 'resolveFailed', status: 422 };
  }
  log({
    stage: 'resolve',
    extractor: media.extractor,
    sizeKb: media.video.filesize ? Math.round(media.video.filesize / 1024) : undefined,
  });

  const response = await fetch(media.video.url, {
    headers: { 'User-Agent': USER_AGENT, ...media.video.headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  if (!response || !response.ok) {
    log({ stage: 'download', status: response?.status ?? 0 });
    return { error: 'resolveFailed', status: 502 };
  }
  const bytes = await readCapped(response, MAX_VIDEO_BYTES);
  if (!bytes) {
    log({ stage: 'download', outcome: 'tooLarge' });
    return { error: 'videoTooLarge', status: 413 };
  }
  log({ stage: 'download', kb: Math.round(bytes.length / 1024) });

  const caption = [media.title, media.description].filter(Boolean).join('\n');
  const recipe = await extractRecipeFromVideo(
    { mimeType: 'video/mp4', base64: Buffer.from(bytes).toString('base64') },
    caption
  );
  if (!recipe.is_recipe) return { error: 'notRecognized', status: 422 };

  return { recipe, image: await fetchImage(media.thumbnail ?? null), credit: media.uploader?.trim() || null };
}

async function importFromWeb(url: string, log: LogFn): Promise<ImportSuccess | ImportFailure> {
  const html = await fetchPage(url);
  if (!html) {
    log({ stage: 'fetch', outcome: 'blocked' });
    return { error: 'siteBlocked', status: 422 };
  }

  const structured = parseJsonLdRecipe(html);
  log({ stage: 'parse', structured: structured ? 1 : 0, htmlKb: Math.round(html.length / 1024) });

  // Even when the page hands us a clean recipe, one AI pass is still worth it: schema.org keeps
  // ingredients as free text ("2 כוסות קמח") and this app stores quantity and unit separately.
  const source = structured ? recipeToText(structured) : htmlToText(html);
  if (source.trim().length < 40) return { error: 'notRecognized', status: 422 };

  const recipe = await extractRecipeFromText(source);
  if (!recipe.is_recipe) return { error: 'notRecognized', status: 422 };

  return {
    recipe,
    image: await fetchImage(structured?.image ?? parseOgImage(html)),
    credit: structured?.author ?? new URL(url).hostname.replace(/^www\./, ''),
  };
}

export async function POST(request: Request) {
  const reqId = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  const log: LogFn = (fields) => {
    const line = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ')}`)
      .join(' ');
    console.log(`[import] id=${reqId} ms=${Date.now() - startedAt} ${line}`);
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'notAllowed' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const parsed = parseSharedUrl(String(body.url ?? ''));
  if (!parsed) {
    log({ outcome: 'invalidUrl' });
    return NextResponse.json({ error: 'invalidUrl' }, { status: 400 });
  }
  if (parsed.kind === 'unsupported') {
    log({ outcome: 'unsupportedSource', host: parsed.host });
    return NextResponse.json({ error: 'unsupportedSource' }, { status: 422 });
  }

  const { data: underLimit } = await supabase.rpc('bump_ai_usage', { daily_limit: DAILY_AI_LIMIT });
  if (underLimit !== true) {
    log({ outcome: 'aiQuota' });
    return NextResponse.json({ error: 'aiQuota' }, { status: 429 });
  }

  log({ kind: parsed.kind, host: parsed.host });

  try {
    const result =
      parsed.kind === 'social' ? await importFromSocial(request, parsed.url, log) : await importFromWeb(parsed.url, log);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    log({
      outcome: 'ok',
      title: result.recipe.title,
      ingredients: result.recipe.ingredients.length,
      image: result.image ? 1 : 0,
    });
    return NextResponse.json({ ...result, sourceUrl: parsed.url });
  } catch (error) {
    if (error instanceof GeminiQuotaError) {
      log({ outcome: 'aiQuota' });
      return NextResponse.json({ error: 'aiQuota' }, { status: 429 });
    }
    if (error instanceof GeminiBusyError) {
      log({ outcome: 'aiBusy' });
      return NextResponse.json({ error: 'aiBusy' }, { status: 503 });
    }
    log({ outcome: 'failed', error: (error as Error).message });
    return NextResponse.json({ error: 'importFailed' }, { status: 502 });
  }
}
