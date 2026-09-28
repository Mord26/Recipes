import 'server-only';
import { extractedRecipeSchema } from './validation';
import type { ExtractedRecipe, Ingredient, Locale } from './types';

/**
 * EVERY free-tier model has its own small daily allowance - measured at 20 requests/day/model
 * ("GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue 20). Funnelling all work through
 * one model therefore capped the whole family at ~4 recipes a day. Spreading across several models
 * multiplies the daily capacity, and an exhausted model is skipped for the rest of the day.
 *
 * Ordered best-quality-first; the lite models are a last resort that still beats failing.
 */
const DEFAULT_MODELS = [
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
];
const fromEnv = (name: string): string[] | null => {
  const raw = process.env[name]?.split(',').map((m) => m.trim()).filter(Boolean);
  return raw && raw.length > 0 ? raw : null;
};
const EXTRACT_MODELS = fromEnv('GEMINI_EXTRACT_MODELS') ?? DEFAULT_MODELS;
// Translation is lighter, so it leads with the lite models and keeps the strong ones in reserve
// for reading photos, which is where quality matters most.
const TRANSLATE_MODELS =
  fromEnv('GEMINI_TRANSLATE_MODELS') ?? [
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.5-flash',
  ];

/**
 * Models whose DAILY allowance is spent, per calendar day. Retrying them only wastes the request
 * budget and the reader's time, so they are skipped until the quota resets.
 */
const exhaustedToday = new Map<string, string>();
const today = () => new Date().toISOString().slice(0, 10);
function isExhausted(model: string): boolean {
  return exhaustedToday.get(model) === today();
}
function markExhausted(model: string): void {
  exhaustedToday.set(model, today());
}

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * Gemini 2.5 uses a token budget; Gemini 3 uses a level ("minimal" is rejected with 400 by these
 * models, so the floor is "low").
 *
 * Reading PHOTOS deliberately uses "low": measured against real recipe scans, "high" returned 503
 * "model is overloaded" on every attempt, and turning thinking off entirely took 59s - right at the
 * function limit. "low" answers in 14-21s and succeeds. Text work is cheap, so it keeps "high".
 */
function thinkingConfig(model: string, effort: 'low' | 'high' = 'high'): Record<string, unknown> {
  if (model.includes('2.5')) return { thinking_budget: effort === 'low' ? 1024 : -1 };
  return { thinking_level: effort };
}

// A verbatim `raw_transcription` field FIRST forces the model to READ the whole page before it
// structures anything (an in-schema chain-of-thought), and `has_unreadable_parts` makes it declare
// uncertainty instead of inventing values.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    raw_transcription: { type: 'STRING' },
    has_unreadable_parts: { type: 'BOOLEAN' },
    is_recipe: { type: 'BOOLEAN' },
    reject_reason: {
      type: 'STRING',
      nullable: true,
      enum: ['handwriting', 'blurry', 'dark', 'cropped', 'notRecipe', 'empty', 'other'],
    },
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    servings: { type: 'INTEGER', nullable: true },
    prep_minutes: { type: 'INTEGER', nullable: true },
    cook_minutes: { type: 'INTEGER', nullable: true },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', nullable: true },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    suggested_tags: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'raw_transcription', 'has_unreadable_parts', 'is_recipe', 'reject_reason', 'title', 'description',
    'servings', 'prep_minutes', 'cook_minutes', 'ingredients', 'steps', 'suggested_tags',
  ],
} as const;

const EXTRACT_RULES = `The source may be Hebrew, English, or mixed. Work in TWO stages and never skip stage 1.

STAGE 1 - raw_transcription: read the ENTIRE input and transcribe every recipe-related word EXACTLY as written, line by line, in the original language(s). Do NOT translate, fix spelling, expand abbreviations, or reorder. If a word, letter or number is unreadable, write [?] in its place - NEVER guess a plausible value. Skip greetings, emojis and chatter, but keep all ingredient and step text.
- has_unreadable_parts: true if you wrote any [?] or genuinely could not read part of the recipe; else false.

STAGE 2 - structure the transcription into the fields below, using ONLY what appears in the transcription. Never invent ingredients, quantities, or steps that are not there.
- is_recipe: true if there are identifiable ingredients OR preparation steps. A plain INGREDIENT LIST with no method (e.g. a sauce, dip, dressing, salad, spice mix, drink or shake) absolutely counts as a recipe - do NOT require cooking steps. Set false ONLY if this is genuinely not food/a recipe at all, is blank, or is too unreadable to yield any real content.
- title: the recipe name in its original language; if missing, infer a short descriptive name from the ingredients in that language (e.g. an avocado + lime + cilantro list -> "רוטב אבוקדו" / "Avocado sauce").
- description: a short intro if present, else "".
- ingredients: one entry per ingredient, in order. name = the ingredient itself, original language; quantity = a plain number (fractions like 1/2 -> 0.5; a range like 1-2 -> the lower number), null if none; unit = the measurement word EXACTLY as written (e.g. כוס, כפית, גרם, cup, tbsp), null if none. Keep parenthetical notes like "or more for thinner consistency", "juiced", "minced", "to taste" as part of the name. Keep an unreadable ingredient with [?] in its name rather than dropping it.
- steps: preparation steps in order, one string each, no leading numbers, original language. If the source has NO method or instructions, return an EMPTY list - never invent steps.
- servings, prep_minutes, cook_minutes: numbers only if stated, else null.
- suggested_tags: up to 5 short tags in the recipe's language, only if clearly applicable.
- reject_reason: null whenever is_recipe is true. When is_recipe is false, say WHY in one word so the app can tell the person what to fix, choosing the single dominant cause:
  "handwriting" - there is handwritten text but the writing is too unclear or joined to read reliably;
  "blurry" - out of focus, motion-blurred, or too low resolution to read;
  "dark" - too dark, washed out, or covered by glare/shadow;
  "cropped" - readable, but the recipe is cut off or only part of it is in frame;
  "empty" - no recipe text at all (a blank page, a photo of food only, a screenshot with no recipe);
  "notRecipe" - readable text, but it is not a recipe;
  "other" - none of the above.`;

const PHOTO_PROMPT = `You are given one or more photos of a recipe. It may be handwritten (cursive or print), typed, a page from a book, or a phone screenshot (e.g. a notes app or a chat), in Hebrew and/or English. Read as carefully as a meticulous human transcriber: cope with messy or joined handwriting, ignore crossed-out words, read notes in the margins, distinguish Hebrew final letters (ך ם ן ף ץ), and expand nothing - keep cooking abbreviations as written (כף, כפית, ג', ק"ג, tbsp, tsp, oz, lb). Think carefully before you write.
IGNORE all surrounding app/phone interface - status bars, clocks, battery, call banners, contact names, timestamps, buttons, checkboxes/tick boxes, share/reply bars, and photo thumbnail strips. Extract ONLY the recipe content itself (usually the main text area). A checkbox or bullet before a line is just a list marker - the text after it is the ingredient/step.
${EXTRACT_RULES}
If several photos are pages of the SAME recipe, merge them in order into one recipe.`;

const TEXT_PROMPT = `You are given the raw text of a recipe, often a WhatsApp message or note, in Hebrew and/or English. It may contain greetings, emojis and chatter - ignore everything that is not part of the recipe itself.
${EXTRACT_RULES}`;

const VIDEO_PROMPT = `You are given a short cooking video from social media (Instagram, TikTok, YouTube or Facebook), in Hebrew and/or English.
Watch it from beginning to end and use EVERY source of information in it:
- the spoken narration,
- the text captions burned onto the screen, which very often hold the full ingredient list and quantities,
- what is visibly done to the food, to recover a step that is never said out loud.
The post's caption is supplied separately as text. It is frequently marketing filler ("save this!", "comment for the link") - take a quantity or an ingredient from it only when the video itself does not give one, and never invent a recipe out of it alone.
Screen text may flash by quickly; read it carefully rather than guessing. Prefer the exact wording and units shown on screen.
${EXTRACT_RULES}
If the video is not a recipe at all, set is_recipe to false.`;

export interface GeminiImage {
  mimeType: string;
  base64: string;
}

/** The real daily free-tier quota is gone - nothing to do but wait for the reset. */
export class GeminiQuotaError extends Error {}
/**
 * Gemini is rate-limiting us right now (requests-per-minute), which clears within a minute. This is
 * NOT the daily quota, and telling the family "come back tomorrow" for it was simply wrong.
 */
export class GeminiBusyError extends Error {}

/**
 * Gemini returns 429 for both the per-day allowance and short rate limits; the quotaId in the body
 * is what distinguishes them (e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier").
 */
function isDailyQuota(detail: string): boolean {
  return /PerDay/i.test(detail);
}

export function parseExtractedRecipe(raw: unknown): ExtractedRecipe {
  return extractedRecipeSchema.parse(raw);
}

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`Gemini failed (${status}): ${detail.slice(0, 160)}`);
  }
}

// Google returns these while a model is briefly overloaded ("experiencing high demand"). They are
// not quota problems and almost always succeed a second later - the cause of "it failed the first
// time and worked on the second try".
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
/** Whole-request budget, kept comfortably under the route's own maxDuration. */
const ATTEMPT_DEADLINE_MS = 95_000;
/**
 * Hard per-attempt timeout. An overloaded Gemini can leave a request hanging for minutes (measured:
 * a 503 that took 234s to come back), which would blow the function's own limit and surface as a
 * dead request. Cutting it off early lets the fallback model actually get a turn.
 */
const ATTEMPT_TIMEOUT_MS = 45_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Structured one-line log so a failure can be diagnosed from the Vercel logs after the fact. */
function logGemini(fields: Record<string, string | number | undefined>) {
  const line = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ')}`)
    .join(' ');
  console.log(`[gemini] ${line}`);
}

/** A single generateContent call. Throws GeminiHttpError with the status so callers can classify. */
async function postGeminiOnce(
  model: string,
  parts: unknown[],
  generationConfig: Record<string, unknown>,
  tag: string,
  attempt: number,
  timeoutMs: number
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(geminiUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const aborted = (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError';
    logGemini({
      tag,
      model,
      attempt,
      ms: Date.now() - started,
      outcome: aborted ? 'timeout' : 'network',
      error: (error as Error).message,
    });
    throw error;
  }
  const ms = Date.now() - started;

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logGemini({ tag, model, attempt, ms, status: response.status, outcome: 'http', detail: detail.slice(0, 180) });
    throw new GeminiHttpError(response.status, detail);
  }

  const payload = await response.json();
  const candidate = payload?.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    // Usually MAX_TOKENS or a safety block - both worth seeing in the logs.
    logGemini({ tag, model, attempt, ms, status: 200, outcome: 'empty', finish: candidate?.finishReason });
    throw new Error(`Gemini ${model} returned an empty response (finishReason=${candidate?.finishReason})`);
  }

  logGemini({ tag, model, attempt, ms, status: 200, outcome: 'ok', chars: text.length });
  return JSON.parse(text);
}

/**
 * Calls the model chain, retrying transient overloads before moving on. A 429 is retried once too:
 * Gemini uses it both for a real daily quota and for a short per-minute rate limit, and only the
 * latter clears on retry. Gives up on the whole chain once the time budget is spent.
 */
async function postGeminiWithRetry(
  models: string[],
  parts: unknown[],
  configFor: (model: string) => Record<string, unknown>,
  tag: string,
  budgetMs: number = ATTEMPT_DEADLINE_MS
): Promise<unknown> {
  const startedAt = Date.now();
  const timeLeft = () => budgetMs - (Date.now() - startedAt);
  let sawDailyQuota = false;
  let sawRateLimit = false;
  let lastError: unknown;

  for (const model of models) {
    // Its daily allowance is already spent - going to it again just burns time.
    if (isExhausted(model)) {
      sawDailyQuota = true;
      continue;
    }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // Never let one attempt eat the whole budget - a hung model must leave room for the fallback.
      const budget = Math.min(ATTEMPT_TIMEOUT_MS, Math.max(5_000, timeLeft()));
      try {
        return await postGeminiOnce(model, parts, configFor(model), tag, attempt, budget);
      } catch (error) {
        lastError = error;
        const status = error instanceof GeminiHttpError ? error.status : 0;
        const detail = error instanceof GeminiHttpError ? error.detail : '';
        if (status === 429) {
          if (isDailyQuota(detail)) {
            // This model is done for the day - fall straight through to the next one.
            markExhausted(model);
            sawDailyQuota = true;
            break;
          }
          sawRateLimit = true;
        }

        // 404 (model retired) and 400 (bad request) will never succeed - move to the next model.
        const retryable = TRANSIENT_STATUSES.has(status) || status === 429 || status === 0;
        if (!retryable || attempt === 2 || timeLeft() < 15_000) break;
        // A short rate limit needs a real pause, not the ~1s an overload needs.
        await sleep(status === 429 ? 6_000 : attempt * 1000);
      }
    }
    if (timeLeft() < 15_000) break;
  }

  logGemini({
    tag,
    outcome: 'exhausted',
    ms: Date.now() - startedAt,
    dailyQuota: sawDailyQuota ? 1 : 0,
    rateLimited: sawRateLimit ? 1 : 0,
  });
  if (sawDailyQuota) throw new GeminiQuotaError('Gemini daily free-tier quota exhausted');
  if (sawRateLimit) throw new GeminiBusyError('Gemini is rate limiting right now - retry shortly');
  throw lastError instanceof Error ? lastError : new Error('Gemini request failed');
}

/** Translation call: one model, light thinking for a more faithful rendering. */
async function requestGeminiJson(
  parts: unknown[],
  responseSchema: unknown,
  tag = 'translate',
  budgetMs?: number
): Promise<unknown> {
  return postGeminiWithRetry(
    TRANSLATE_MODELS,
    parts,
    (model) => ({
      response_mime_type: 'application/json',
      response_schema: responseSchema,
      temperature: 0.15,
      thinking_config: thinkingConfig(model, 'low'),
    }),
    tag,
    budgetMs
  );
}

/** Runs extraction across the model chain with thinking enabled, retrying transient failures. */
async function extractWithGemini(
  parts: unknown[],
  tag: string,
  effort: 'low' | 'high'
): Promise<ExtractedRecipe> {
  const json = await postGeminiWithRetry(
    EXTRACT_MODELS,
    parts,
    (model) => ({
      response_mime_type: 'application/json',
      response_schema: RESPONSE_SCHEMA,
      temperature: 0,
      thinking_config: thinkingConfig(model, effort),
    }),
    tag
  );
  return parseExtractedRecipe(json);
}

export async function extractRecipeFromImages(images: GeminiImage[]): Promise<ExtractedRecipe> {
  const bytes = images.reduce((total, image) => total + image.base64.length, 0);
  logGemini({ tag: 'extract-photo', images: images.length, kb: Math.round((bytes * 0.75) / 1024) });
  return extractWithGemini(
    [
      { text: PHOTO_PROMPT },
      ...images.map((image) => ({ inline_data: { mime_type: image.mimeType, data: image.base64 } })),
    ],
    'extract-photo',
    'low'
  );
}

export async function extractRecipeFromText(text: string): Promise<ExtractedRecipe> {
  logGemini({ tag: 'extract-text', chars: text.length });
  return extractWithGemini([{ text: TEXT_PROMPT }, { text }], 'extract-text', 'high');
}

export interface GeminiVideo {
  mimeType: string;
  base64: string;
}

/**
 * Reads a recipe out of a social media cooking video. This is the only way to import from
 * Instagram and TikTok, where the caption is usually marketing and the recipe lives in the video.
 */
export async function extractRecipeFromVideo(video: GeminiVideo, caption?: string): Promise<ExtractedRecipe> {
  logGemini({ tag: 'extract-video', kb: Math.round((video.base64.length * 0.75) / 1024), caption: caption?.length ?? 0 });
  const parts: unknown[] = [
    { text: VIDEO_PROMPT },
    { inline_data: { mime_type: video.mimeType, data: video.base64 } },
  ];
  if (caption && caption.trim()) {
    parts.push({ text: `Caption posted with the video:
${caption.trim().slice(0, 3000)}` });
  }
  // Video is already expensive to process; heavy thinking on top of it reliably returns 503.
  return extractWithGemini(parts, 'extract-video', 'low');
}

// --- Recipe translation ------------------------------------------------------

const TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    credit: { type: 'STRING', nullable: true },
    ingredient_names: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredient_units: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'description', 'credit', 'ingredient_names', 'ingredient_units', 'steps'],
} as const;

export interface RecipeToTranslate {
  title: string;
  description: string;
  credit: string | null;
  ingredients: Ingredient[];
  steps: string[];
}

export interface TranslatedRecipe {
  title: string;
  description: string;
  credit: string | null;
  ingredients: Ingredient[];
  steps: string[];
}

const LANGUAGE_NAME: Record<Locale, string> = { he: 'Hebrew', en: 'English' };

/**
 * Translates a whole recipe into the target language, preserving structure exactly.
 * Quantities and unit words are passed through untouched (the display layer localizes units);
 * only human-readable text (title, description, credit, ingredient names, steps) is translated.
 * Translation is applied element-wise: if a returned array is short (long recipes, truncation),
 * whatever came back is still used and only the missing tail keeps the original - the recipe is
 * never left fully untranslated because of a length mismatch.
 */
export async function translateRecipe(
  recipe: RecipeToTranslate,
  target: Locale,
  budgetMs?: number
): Promise<TranslatedRecipe> {
  const prompt = `You are a professional cookbook translator. Translate this ENTIRE recipe into ${LANGUAGE_NAME[target]} the way a native ${LANGUAGE_NAME[target]} cookbook would print it - fluent and natural, never word-for-word. Nothing may be left in the original language, including section headings that appear inside the ingredients or steps (e.g. "For the dough", "למילוי").

HOW TO TRANSLATE THE METHOD (steps) - this matters most:
- Use real culinary vocabulary of the target language: fold, whisk, sauté, simmer, knead, sear, proof, reduce / לקפל, להקציף, לטגן, לבשל על אש נמוכה, ללוש, להשחים, להתפיח, לצמצם. Do NOT translate cooking verbs literally.
- ${target === 'he' ? 'CRITICAL - verb form: every Hebrew step must use the impersonal PRESENT PLURAL that Israeli recipes are written in. WRONG: "לבשל את הפסטה", "לקפל את הבצק", "יש לחמם". RIGHT: "מבשלים את הפסטה", "מקפלים את הבצק", "מחממים". Never use the infinitive (ל+verb) as a command, never "אתה", never "יש ל".' : 'Verb form: every English step uses the plain imperative a US recipe is written in ("Preheat the oven", "Whisk the eggs", "Fold in the flour") - never "you should" and never a gerund.'}
- Translate the FULL sentence. Never shorten, summarise, merge or drop a sentence, and never leave a clause in the source language.
- Keep every number, time, temperature, pan size and quantity EXACTLY as given (180°C stays 180°C, 5 דקות stays 5 minutes). Convert nothing.
- Keep parenthetical asides, tips and warnings, translated.

Return:
- title: the dish name as a ${LANGUAGE_NAME[target]} cookbook would name it (not a literal gloss).
- description, credit: the translated text ("" for empty; null credit stays null).
- ingredient_names: the translated ingredient names, one per input, in the SAME ORDER and SAME COUNT. Translate the food name and any preparation note attached to it ("chopped", "קצוץ", "juiced").
- ingredient_units: the translated MEASUREMENT WORD for each ingredient, one per input, SAME ORDER and SAME COUNT. Use the word a ${LANGUAGE_NAME[target]} recipe would print: cup/כוס, tbsp/כף, tsp/כפית, gram/גרם, clove/שן, bunch/צרור, handful/חופן, sprig/ענף, stalk/גבעול, slice/פרוסה, can/קופסה, pinch/קורט. Keep any size word attached ("big bunch" -> "צרור גדול"). Return "" for an ingredient that has no measurement word. Never leave a unit in the source language.
- steps: the translated preparation steps, one per input step, in the SAME ORDER and SAME COUNT.

Recipe (JSON):
${JSON.stringify({
    title: recipe.title,
    description: recipe.description,
    credit: recipe.credit,
    ingredient_names: recipe.ingredients.map((i) => i.name),
    ingredient_units: recipe.ingredients.map((i) => i.unit ?? ''),
    steps: recipe.steps,
  })}`;

  const json = (await requestGeminiJson([{ text: prompt }], TRANSLATION_SCHEMA, 'translate', budgetMs)) as TranslationResponse;
  return mergeTranslation(recipe, json);
}

export interface TranslationResponse {
  title?: string;
  description?: string;
  credit?: string | null;
  ingredient_names?: string[];
  ingredient_units?: string[];
  steps?: string[];
}

/**
 * Merges Gemini's translation back onto the recipe, element-wise. Each translated name/step is used
 * when present; anything missing (short array, truncation) keeps the original, and extra items are
 * ignored - so a length mismatch never leaves the recipe fully untranslated.
 */
export function mergeTranslation(recipe: RecipeToTranslate, json: TranslationResponse): TranslatedRecipe {
  const names = json.ingredient_names ?? [];
  const units = json.ingredient_units ?? [];
  const steps = json.steps ?? [];
  return {
    title: json.title?.trim() || recipe.title,
    description: json.description?.trim() ?? recipe.description,
    credit: json.credit?.trim() ? json.credit.trim() : recipe.credit,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      ...ingredient,
      name: names[index]?.trim() || ingredient.name,
      // A translated unit still resolves to the same canonical id (resolveUnit knows both
      // languages), so this only ever rescues free-text units like "cloves" or "big bunch".
      unit: ingredient.unit === null ? null : units[index]?.trim() || ingredient.unit,
    })),
    steps: recipe.steps.map((step, index) => steps[index]?.trim() || step),
  };
}

// --- Title translation (for list views) --------------------------------------

const TITLES_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, title: { type: 'STRING' } },
        required: ['id', 'title'],
      },
    },
  },
  required: ['titles'],
} as const;

/**
 * Translates a batch of recipe titles in ONE call, keyed by id so a dropped/extra item can't
 * misalign the results. Returns id -> translated title; ids missing from the response are simply
 * left to the caller to fall back to the original.
 */
export async function translateTitles(items: { id: string; title: string }[], target: Locale): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  const prompt = `Translate ONLY these recipe titles into ${LANGUAGE_NAME[target]}, naturally, the way a ${LANGUAGE_NAME[target]} cookbook would name the dish. Return every item with its EXACT id unchanged. Do not add, drop, merge or reorder items.
Titles (JSON):
${JSON.stringify(items)}`;

  const json = (await requestGeminiJson([{ text: prompt }], TITLES_SCHEMA, 'translate-titles')) as {
    titles?: { id?: string; title?: string }[];
  };

  for (const entry of json.titles ?? []) {
    if (entry?.id && entry.title?.trim()) out.set(entry.id, entry.title.trim());
  }
  return out;
}
