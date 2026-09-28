-- The family admin curates the whole cookbook: allow deleting anyone's recipe.
-- Editing stays owner-only; this is deletion (cleanup) only.
drop policy if exists "recipes_delete" on public.recipes;

create policy "recipes_delete" on public.recipes for delete to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Child rows are removed by "on delete cascade" from recipes, but recipe_photos also has its own
-- delete policy (owner/uploader). Let the admin remove any photo too, so deleting a recipe or
-- cleaning up a bad photo never half-fails.
drop policy if exists "recipe_photos_delete" on public.recipe_photos;

create policy "recipe_photos_delete" on public.recipe_photos for delete to authenticated
  using (
    uploader_id = auth.uid()
    or exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
