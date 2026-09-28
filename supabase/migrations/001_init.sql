-- Family Recipes: initial schema
create extension if not exists pg_trgm;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{2,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null default 'member' check (role in ('member','admin')),
  default_visibility text not null default 'family' check (default_visibility in ('private','family')),
  locale text not null default 'he' check (locale in ('he','en')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count int;
begin
  select count(*) into member_count from public.profiles;
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    case when member_count = 0 then 'admin' else 'member' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- recipes ----------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  servings int check (servings between 1 and 100),
  prep_minutes int check (prep_minutes between 0 and 6000),
  cook_minutes int check (cook_minutes between 0 and 6000),
  difficulty text check (difficulty in ('easy','medium','hard')),
  visibility text not null default 'family' check (visibility in ('private','family')),
  source text not null default 'manual' check (source in ('manual','photo')),
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_recipe_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := lower(
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce((select string_agg(item->>'name', ' ') from jsonb_array_elements(new.ingredients) item), '') || ' ' ||
    coalesce((select string_agg(t.name, ' ') from public.recipe_tags rt join public.tags t on t.id = rt.tag_id where rt.recipe_id = new.id), '')
  );
  new.updated_at := now();
  return new;
end;
$$;

create trigger recipes_search_text
  before insert or update on public.recipes
  for each row execute function public.set_recipe_search_text();

create index recipes_owner_idx on public.recipes (owner_id);
create index recipes_created_idx on public.recipes (created_at desc);
create index recipes_search_trgm_idx on public.recipes using gin (search_text gin_trgm_ops);

-- ---------- recipe photos ----------
create table public.recipe_photos (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'photo' check (kind in ('photo','scan')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index recipe_photos_recipe_idx on public.recipe_photos (recipe_id);

-- ---------- categories ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name_he text check (char_length(name_he) between 1 and 40),
  name_en text check (char_length(name_en) between 1 and 40),
  emoji text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint category_has_name check (name_he is not null or name_en is not null)
);

create unique index categories_name_he_idx on public.categories (lower(name_he)) where name_he is not null;
create unique index categories_name_en_idx on public.categories (lower(name_en)) where name_en is not null;

create table public.recipe_categories (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (recipe_id, category_id)
);

-- ---------- tags ----------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);

create unique index tags_name_idx on public.tags (lower(name));

create table public.recipe_tags (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);

-- ---------- comments ----------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  visibility text not null default 'everyone' check (visibility in ('everyone','private')),
  created_at timestamptz not null default now()
);

create index comments_recipe_idx on public.comments (recipe_id);

-- ---------- favorites ----------
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index favorites_recipe_idx on public.favorites (recipe_id);

-- ---------- ratings ----------
create table public.ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index ratings_recipe_idx on public.ratings (recipe_id);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_photos enable row level security;
alter table public.categories enable row level security;
alter table public.recipe_categories enable row level security;
alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.comments enable row level security;
alter table public.favorites enable row level security;
alter table public.ratings enable row level security;

-- profiles: everyone signed in can see who is in the family; users edit only safe columns of their own row
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, delete on public.profiles from authenticated, anon;
revoke update on public.profiles from authenticated, anon;
grant update (display_name, default_visibility, locale) on public.profiles to authenticated;

-- recipes
create policy "recipes_select" on public.recipes for select to authenticated
  using (visibility = 'family' or owner_id = auth.uid());
create policy "recipes_insert" on public.recipes for insert to authenticated
  with check (owner_id = auth.uid());
create policy "recipes_update" on public.recipes for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "recipes_delete" on public.recipes for delete to authenticated
  using (owner_id = auth.uid());

-- helper condition used by child tables: parent recipe is visible / owned
create policy "recipe_photos_select" on public.recipe_photos for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid())));
create policy "recipe_photos_mutate" on public.recipe_photos for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

-- categories: shared vocabulary, anyone can add; only admin deletes
create policy "categories_select" on public.categories for select to authenticated using (true);
create policy "categories_insert" on public.categories for insert to authenticated
  with check (created_by = auth.uid());
create policy "categories_delete" on public.categories for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "recipe_categories_select" on public.recipe_categories for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid())));
create policy "recipe_categories_mutate" on public.recipe_categories for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

-- tags
create policy "tags_select" on public.tags for select to authenticated using (true);
create policy "tags_insert" on public.tags for insert to authenticated with check (true);

create policy "recipe_tags_select" on public.recipe_tags for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid())));
create policy "recipe_tags_mutate" on public.recipe_tags for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

-- comments: private notes visible to author only; recipe must be visible
create policy "comments_select" on public.comments for select to authenticated
  using (
    (visibility = 'everyone' or author_id = auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid()))
  );
create policy "comments_insert" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid()))
  );
create policy "comments_update" on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "comments_delete" on public.comments for delete to authenticated
  using (author_id = auth.uid());

-- favorites: strictly personal
create policy "favorites_all" on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ratings: everyone sees ratings of visible recipes, writes own
create policy "ratings_select" on public.ratings for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid())));
create policy "ratings_insert" on public.ratings for insert to authenticated with check (user_id = auth.uid());
create policy "ratings_update" on public.ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ratings_delete" on public.ratings for delete to authenticated
  using (user_id = auth.uid());

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public;

create policy "photos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos');
create policy "photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'photos');
create policy "photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and owner_id::uuid = auth.uid());

-- ---------- seed categories ----------
insert into public.categories (name_he, name_en, emoji) values
  ('מנות עיקריות', 'Main Dishes', '🍲'),
  ('קינוחים', 'Desserts', '🍰'),
  ('מרקים', 'Soups', '🥣'),
  ('סלטים', 'Salads', '🥗'),
  ('מאפים', 'Baked Goods', '🥐'),
  ('תוספות', 'Side Dishes', '🍚'),
  ('ארוחות בוקר', 'Breakfast', '🍳'),
  ('משקאות', 'Drinks', '🥤'),
  ('חטיפים', 'Snacks', '🥨'),
  ('שבת וחג', 'Shabbat & Holidays', '🕯️');
