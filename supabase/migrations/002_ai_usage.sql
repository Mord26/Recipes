-- App-level daily cap for Gemini calls: belt-and-suspenders on top of the
-- billing-free API key (no billing account = Google cannot charge).
create table public.ai_usage (
  day date primary key,
  count int not null default 0
);

alter table public.ai_usage enable row level security;
-- No policies on purpose: only the definer function below (and service role) may touch it.

create or replace function public.bump_ai_usage(daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count int;
begin
  insert into public.ai_usage as u (day, count) values (current_date, 1)
  on conflict (day) do update set count = u.count + 1
  returning u.count into current_count;
  return current_count <= daily_limit;
end;
$$;

revoke all on function public.bump_ai_usage(int) from public;
grant execute on function public.bump_ai_usage(int) to authenticated;
