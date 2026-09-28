-- One row each time a family member cooks a recipe through to the last step. Powers the
-- "cooked N times" badge, which is the social feedback that encourages sharing and cooking.
create table public.cook_logs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index cook_logs_recipe_idx on public.cook_logs (recipe_id);
create index cook_logs_user_idx on public.cook_logs (user_id);

alter table public.cook_logs enable row level security;

-- Visible for any recipe the reader can see; a member only ever writes their own rows.
create policy "cook_logs_select" on public.cook_logs for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "cook_logs_insert" on public.cook_logs for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "cook_logs_delete" on public.cook_logs for delete to authenticated using (user_id = auth.uid());
