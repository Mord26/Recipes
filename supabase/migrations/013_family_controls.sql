-- Family management: personal invite links, admin blocking, and per-member notification choice.

-- Per-member flags. Defaults keep every existing member exactly as they are today.
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists can_add_recipes boolean not null default true;
alter table public.profiles add column if not exists notify_new_recipes boolean not null default true;

-- One-time invite links that expire, so a forwarded link cannot quietly let strangers in.
create table public.family_invites (
  token text primary key,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null
);

create index family_invites_created_by_idx on public.family_invites (created_by);

alter table public.family_invites enable row level security;

-- Members can create invites and see the ones they created. Redeeming happens server-side with the
-- service-role key, because the person signing up is not authenticated yet.
create policy "family_invites_select" on public.family_invites for select to authenticated
  using (created_by = auth.uid());
create policy "family_invites_insert" on public.family_invites for insert to authenticated
  with check (created_by = auth.uid());
create policy "family_invites_delete" on public.family_invites for delete to authenticated
  using (created_by = auth.uid());

-- Blocking is enforced in the database, not only in the UI, so it holds even if someone talks to
-- the API directly. A helper keeps the policies readable and consistent.
create or replace function public.member_is_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.blocked = false);
$$;

create or replace function public.member_can_add_recipes(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.blocked = false and p.can_add_recipes = true
  );
$$;

drop policy if exists "recipes_select" on public.recipes;
create policy "recipes_select" on public.recipes for select to authenticated
  using (public.member_is_active(auth.uid()) and (visibility = 'family' or owner_id = auth.uid()));

drop policy if exists "recipes_insert" on public.recipes;
create policy "recipes_insert" on public.recipes for insert to authenticated
  with check (owner_id = auth.uid() and public.member_can_add_recipes(auth.uid()));
