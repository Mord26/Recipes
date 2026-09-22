-- Client-side failures were invisible: a photo upload that died in the browser left no trace
-- anywhere, so "the picture vanished" could not be investigated at all. Vercel logs are useless
-- for this (they only keep the last ~100 lines), so events land in a table we can query.
create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event text not null,
  recipe_id uuid,
  detail jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists client_events_created_idx on public.client_events (created_at desc);
create index if not exists client_events_event_idx on public.client_events (event, created_at desc);

alter table public.client_events enable row level security;

-- Anyone signed in may report their own events; only an admin may read them back.
drop policy if exists "client_events_insert" on public.client_events;
create policy "client_events_insert" on public.client_events
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "client_events_select" on public.client_events;
create policy "client_events_select" on public.client_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Keep the table small on its own; a family app has no need for months of diagnostics.
create or replace function public.prune_client_events() returns void
language sql security definer set search_path = public as $$
  delete from public.client_events where created_at < now() - interval '30 days';
$$;
