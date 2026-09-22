import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { extractRecipeFromImages, extractRecipeFromText, GeminiBusyError, GeminiQuotaError, type GeminiImage } from '@/lib/gemini';

// Reading photos legitimately takes 15-45s per attempt, and the route may fall back to a second
// model. 60s left no headroom at all and was silently killing slow-but-fine extractions.
export const maxDuration = 120;

const MAX_FILES = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
// Courtesy cap only. The key has no billing attached, so it can never be charged - Gemini's own
// free-tier limit is the real ceiling and is handled gracefully. 150 was needlessly tight for a
// family that adds several recipes in one sitting (each one also triggers a translation).
const DAILY_AI_LIMIT = 500;

export async function POST(request: Request) {
  // Short id so every line of one extraction can be grepped together in the Vercel logs.
  const reqId = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  const log = (fields: Record<string, string | number | undefined>) => {
    const line = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ')}`)
      .join(' ');
    console.log(`[extract] id=${reqId} ms=${Date.now() - startedAt} ${line}`);
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log({ outcome: 'notAllowed' });
    return NextResponse.json({ error: 'notAllowed' }, { status: 401 });
  }

  const { data: underLimit, error: usageError } = await supabase.rpc('bump_ai_usage', {
    daily_limit: DAILY_AI_LIMIT,
  });
  if (usageError || underLimit !== true) {
    log({ outcome: 'aiQuota', usageError: usageError?.message });
    return NextResponse.json({ error: 'aiQuota' }, { status: 429 });
  }

  const formData = await request.formData();
  const pastedText = formData.get('text');
  const files = formData.getAll('images').filter((entry): entry is File => entry instanceof File);

  const isTextMode = typeof pastedText === 'string' && pastedText.trim().length > 0;

  log({
    mode: isTextMode ? 'text' : 'photo',
    files: files.length,
    types: files.map((file) => file.type).join(','),
    sizesKb: files.map((file) => Math.round(file.size / 1024)).join(','),
  });

  if (isTextMode) {
    const trimmed = (pastedText as string).trim();
    if (trimmed.length < 20 || trimmed.length > 10000) {
      log({ outcome: 'invalidInput', reason: 'textLength', chars: trimmed.length });
      return NextResponse.json({ error: 'invalidInput' }, { status: 400 });
    }
  } else if (files.length === 0 || files.length > MAX_FILES) {
    log({ outcome: 'invalidInput', reason: 'fileCount', files: files.length });
    return NextResponse.json({ error: 'invalidInput' }, { status: 400 });
  }

  const images: GeminiImage[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
      log({ outcome: 'invalidInput', reason: 'fileTypeOrSize', type: file.type, kb: Math.round(file.size / 1024) });
      return NextResponse.json({ error: 'invalidInput' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push({ mimeType: file.type, base64: buffer.toString('base64') });
  }

  try {
    const recipe = isTextMode
      ? await extractRecipeFromText((pastedText as string).trim())
      : await extractRecipeFromImages(images);
    // Accept ingredient-only recipes (sauces, dips, spice mixes) and method-only notes alike;
    // reject only when the model found neither ingredients nor steps.
    if (!recipe.is_recipe || (recipe.ingredients.length === 0 && recipe.steps.length === 0)) {
      const reason = recipe.reject_reason ?? 'other';
      log({
        outcome: 'notRecognized',
        isRecipe: recipe.is_recipe ? 1 : 0,
        reason,
        ing: recipe.ingredients.length,
        steps: recipe.steps.length,
        transcribed: recipe.title ? 1 : 0,
      });
      // The reason travels with the error so the form can explain what to fix instead of just
      // saying it failed, which taught people to give up and type everything by hand.
      return NextResponse.json({ error: 'notRecognized', reason }, { status: 422 });
    }
    log({
      outcome: 'ok',
      ing: recipe.ingredients.length,
      steps: recipe.steps.length,
      unreadable: recipe.has_unreadable_parts ? 1 : 0,
    });
    return NextResponse.json({ recipe, hasUnreadableParts: recipe.has_unreadable_parts });
  } catch (error) {
    if (error instanceof GeminiQuotaError) {
      log({ outcome: 'aiQuota', reason: 'geminiDailyQuota' });
      return NextResponse.json({ error: 'aiQuota' }, { status: 429 });
    }
    if (error instanceof GeminiBusyError) {
      // Per-minute rate limit: it clears in seconds, so say so instead of "come back tomorrow".
      log({ outcome: 'aiBusy', reason: 'geminiRateLimit' });
      return NextResponse.json({ error: 'aiBusy' }, { status: 429 });
    }
    log({ outcome: 'extractFailed', error: (error as Error).message });
    return NextResponse.json({ error: 'extractFailed' }, { status: 502 });
  }
}
