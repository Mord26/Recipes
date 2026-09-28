-- Cached machine translations of a recipe into the reader's language.
-- One row per (recipe, locale). source_updated_at records the recipe.updated_at the
-- translation was built from, so an edited recipe invalidates its stale translations.
create table public.recipe_translations (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  locale text not null check (locale in ('he', 'en')),
  title text not null,
  description text not null default '',
  credit text,
  ingredients jsonb not null,
  steps jsonb not null,
  source_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (recipe_id, locale)
);

alter table public.recipe_translations enable row level security;

-- Readable/insertable only when the underlying recipe is visible to the user.
-- The subquery is evaluated under the caller's RLS, so recipe visibility is inherited.
create policy "recipe_translations_select" on public.recipe_translations for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));

create policy "recipe_translations_insert" on public.recipe_translations for insert to authenticated
  with check (exists (select 1 from public.recipes r where r.id = recipe_id));

create policy "recipe_translations_update" on public.recipe_translations for update to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id));
