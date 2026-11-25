-- Record who created and last updated each dispatch. IDs link to profiles;
-- name snapshots stay readable because profile RLS hides other users from
-- staff and viewers. Values are set by trigger from the caller's JWT.
alter table public.dispatches
    add column if not exists created_by uuid references public.profiles(id) on delete set null,
    add column if not exists created_by_name text,
    add column if not exists updated_by uuid references public.profiles(id) on delete set null,
    add column if not exists updated_by_name text;

create or replace function public.profile_display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(nullif(btrim(p.username), ''), p.email, u.email)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.id = p_profile_id;
$$;

create or replace function public.set_dispatch_audit_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
begin
    if tg_op = 'INSERT' then
        -- Without a JWT (service role/SQL), keep explicitly supplied values.
        new.created_by := coalesce(v_user_id, new.created_by);
        new.created_by_name := case
            when v_user_id is not null then public.profile_display_name(v_user_id)
            else new.created_by_name
        end;
        new.updated_by := new.created_by;
        new.updated_by_name := new.created_by_name;
    else
        -- ON DELETE SET NULL cleanup must clear IDs without stamping an updater.
        if (old.created_by is not null and new.created_by is null)
           or (old.updated_by is not null and new.updated_by is null) then
            new.created_by_name := old.created_by_name;
            new.updated_by_name := old.updated_by_name;
            return new;
        end if;
        new.created_by := old.created_by;
        new.created_by_name := old.created_by_name;
        if v_user_id is not null then
            new.updated_by := v_user_id;
            new.updated_by_name := public.profile_display_name(v_user_id);
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists on_set_dispatch_audit_users on public.dispatches;
create trigger on_set_dispatch_audit_users
before insert or update on public.dispatches
for each row execute function public.set_dispatch_audit_users();

revoke all on function public.profile_display_name(uuid) from public, anon, authenticated;
revoke all on function public.set_dispatch_audit_users() from public, anon, authenticated;

create index if not exists idx_dispatches_created_by on public.dispatches(created_by);
create index if not exists idx_dispatches_updated_by on public.dispatches(updated_by);
