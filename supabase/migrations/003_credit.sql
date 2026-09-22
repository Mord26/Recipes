-- "המתכון של..." - original source credit, separate from the uploader.
alter table public.recipes add column credit text check (char_length(credit) <= 60);

create or replace function public.set_recipe_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := lower(
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.credit, '') || ' ' ||
    coalesce((select string_agg(item->>'name', ' ') from jsonb_array_elements(new.ingredients) item), '') || ' ' ||
    coalesce((select string_agg(t.name, ' ') from public.recipe_tags rt join public.tags t on t.id = rt.tag_id where rt.recipe_id = new.id), '')
  );
  new.updated_at := now();
  return new;
end;
$$;
