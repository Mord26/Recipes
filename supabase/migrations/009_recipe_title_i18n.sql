-- Lightweight cache of translated recipe TITLES for list views (home/favorites/search), so a
-- recipe's name is shown in the reader's app language everywhere - not only inside the recipe.
-- Kept separate from recipe_translations (full-recipe cache) so a title-only row can never be
-- mistaken for a full translation. source_title records the original the translation was made from,
-- so an edited title invalidates the stale cached translation.
create table public.recipe_title_i18n (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  locale text not null check (locale in ('he', 'en')),
  title text not null,
  source_title text not null,
  created_at timestamptz not null default now(),
  primary key (recipe_id, locale)
);

alter table public.recipe_title_i18n enable row level security;

-- Readable/writable only when the underlying recipe is visible to the caller (inherits recipe RLS).
create policy "recipe_title_i18n_select" on public.recipe_title_i18n for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "recipe_title_i18n_insert" on public.recipe_title_i18n for insert to authenticated
  with check (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "recipe_title_i18n_update" on public.recipe_title_i18n for update to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id));
