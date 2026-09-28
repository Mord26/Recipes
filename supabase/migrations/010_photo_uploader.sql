-- Let any family member add DISH photos to a recipe (not only its owner), tracking who uploaded
-- each one so the UI can mark photos added by someone other than the recipe's creator.
alter table public.recipe_photos add column uploader_id uuid references public.profiles(id);

-- Existing photos were added by the recipe owner.
update public.recipe_photos p
set uploader_id = r.owner_id
from public.recipes r
where r.id = p.recipe_id and p.uploader_id is null;

-- Replace the owner-only "for all" mutate policy with per-command policies.
drop policy if exists "recipe_photos_mutate" on public.recipe_photos;

-- INSERT: any member may add a dish photo (kind='photo') to a recipe visible to them, tagged as
-- their own upload; scans (immutable source images) stay owner-only.
create policy "recipe_photos_insert" on public.recipe_photos for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id and (r.visibility = 'family' or r.owner_id = auth.uid())
    )
    and (
      kind = 'photo'
      or exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
    )
  );

-- UPDATE / DELETE: the recipe owner (any photo) or the uploader (their own photo).
create policy "recipe_photos_update" on public.recipe_photos for update to authenticated
  using (
    uploader_id = auth.uid()
    or exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
  )
  with check (
    uploader_id = auth.uid()
    or exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
  );

create policy "recipe_photos_delete" on public.recipe_photos for delete to authenticated
  using (
    uploader_id = auth.uid()
    or exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
  );
