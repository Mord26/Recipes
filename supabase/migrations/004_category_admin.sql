-- Allow the family admin to rename categories (delete policy already exists in 001).
create policy "categories_update_admin" on public.categories for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
