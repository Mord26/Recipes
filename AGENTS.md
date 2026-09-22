<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Family Recipes - Project Instructions

Collaborative family recipe app. Owner is a non-developer product owner; respond in Hebrew, decide technical matters yourself.

## Architecture

- Next.js App Router + TypeScript + Tailwind v4. Hebrew RTL default, English LTR via next-intl (cookie-based locale, no URL prefix).
- Supabase: Postgres + RLS, Auth (username+password via synthetic email `<username>@family.local`, optional real email), Storage bucket `photos` (public, UUID paths).
- All mutations go through server actions in `src/lib/actions/` using `@supabase/ssr` cookie sessions. Service-role client (`src/lib/supabase/admin.ts`) is server-only: signup, username->email lookup, admin password reset.
- Gemini (`gemini-flash-latest` rolling alias - pinned versions get sunset) extracts recipes from photos via `src/app/api/extract/route.ts` (REST, JSON schema response, zod-validated).
- Recipe visibility: 'private' | 'family'. Comment visibility: 'everyone' | 'private'. Enforced by RLS, mirrored in UI.
- Scanned source photos (`recipe_photos.kind='scan'`) are immutable originals, kept separate from dish photos (`kind='photo'`, max 3).

## Rules

- Read LESSONS.md before touching code; append lessons on mistakes.
- DB changes only via new numbered files in `supabase/migrations/`.
- Unit tests (Vitest) for pure logic in `src/lib`. Run `npm test` and `npm run typecheck` before finishing.
- UI text never hardcoded - always through next-intl messages (`messages/he.json`, `messages/en.json`).
- Free tiers only; warn before anything that costs money.
