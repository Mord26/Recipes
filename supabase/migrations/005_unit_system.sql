-- Per-user measuring system preference: metric (Israel) or US customary.
alter table public.profiles
  add column unit_system text not null default 'metric' check (unit_system in ('metric','us'));

grant update (display_name, default_visibility, locale, unit_system) on public.profiles to authenticated;
