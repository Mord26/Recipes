-- Web Push: browser subscriptions + scheduled timer reminders that fire even when the app is closed.

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_sub_select" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push_sub_insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "push_sub_update" on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_sub_delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create table public.timer_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fire_at timestamptz not null,
  label text not null,
  recipe_title text,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index timer_reminders_due_idx on public.timer_reminders (fire_at) where sent = false;

alter table public.timer_reminders enable row level security;

create policy "timer_select" on public.timer_reminders for select to authenticated using (user_id = auth.uid());
create policy "timer_insert" on public.timer_reminders for insert to authenticated with check (user_id = auth.uid());
create policy "timer_update" on public.timer_reminders for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "timer_delete" on public.timer_reminders for delete to authenticated using (user_id = auth.uid());
