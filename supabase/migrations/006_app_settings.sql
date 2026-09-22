-- Family-wide settings the admin controls for everyone (single shared row).
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  hide_ratings boolean not null default false,
  hide_tags boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

create policy "app_settings_select" on public.app_settings for select to authenticated using (true);

create policy "app_settings_update_admin" on public.app_settings for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
