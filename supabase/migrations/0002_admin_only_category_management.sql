-- Restrict item category management to admins only.
-- Keep read access for all approved users.

drop policy if exists "Approved users can manage categories" on public.item_categories;
drop policy if exists "Admins can manage categories" on public.item_categories;

create policy "Admins can manage categories" on public.item_categories
for all
using (public.has_permission(array['admin']))
with check (public.has_permission(array['admin']));
