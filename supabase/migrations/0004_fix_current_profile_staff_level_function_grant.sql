-- Fix role update failures caused by missing execute privilege in profiles update policy.
-- The policy references current_profile_staff_level_id(), so authenticated users need execute.

grant execute on function public.current_profile_staff_level_id() to authenticated;
grant execute on function public.current_profile_staff_level_id() to service_role;

-- Restrict profile role assignment/changes to admins only.
-- Keep self-profile updates possible as long as users do not change their own staff_level_id.

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile" on public.profiles
for update
using (
	auth.uid() = id
	or public.has_permission(array['admin'])
)
with check (
	public.has_permission(array['admin'])
	or (
		auth.uid() = id
		and staff_level_id is not distinct from public.current_profile_staff_level_id()
	)
);
