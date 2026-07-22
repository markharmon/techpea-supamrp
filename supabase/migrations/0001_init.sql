-- Consolidated initialization migration.
-- This file represents the latest schema, security model, views, and helpers.
create extension if not exists pgcrypto;

-- 1. Access levels and profiles
create table if not exists public.staff_level (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    permission_name text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Initial staff levels
insert into public.staff_level (name, permission_name)
values
    ('Admin', 'admin'),
    ('Supervisor', 'supervisor'),
    ('Staff', 'staff'),
    ('Viewer', 'viewer')
on conflict (name) do nothing;

create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    username text,
    avatar_url text,
    email text,
    staff_level_id uuid references public.staff_level(id) on delete set null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 2. Item lookups
create table if not exists public.item_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.vendors (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    contact_name text,
    email text,
    phone text,
    website text,
    notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

insert into public.vendors (name)
values ('Techpea')
on conflict (name) do nothing;

-- 3. Items and BOM
create table if not exists public.items (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    sku text unique,
    description text,
    unit text not null default 'pcs',
    current_stock numeric not null default 0,
    reserved_stock numeric not null default 0,
    cost_per_unit numeric default 0,
    sales_price numeric default 0,
    is_manufactured boolean default false,
    is_saleable boolean default false,
    category_id uuid references public.item_categories(id) on delete set null,
    vendor_id uuid references public.vendors(id) on delete set null,
    weight numeric default 0,
    vendor_sku text,
    vendor_description text,
    reorder_level numeric default 0,
    reorder_quantity numeric default 0,
    pack_size numeric default 1,
    barcode text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.bom (
    id uuid primary key default gen_random_uuid(),
    parent_item_id uuid not null references public.items(id) on delete cascade,
    child_item_id uuid not null references public.items(id) on delete restrict,
    quantity numeric not null check (quantity > 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (parent_item_id, child_item_id)
);

-- 4. Work orders and production
create table if not exists public.work_orders (
    id uuid primary key default gen_random_uuid(),
    reference_number int generated always as identity,
    status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
    notes text,
    due_date date,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.work_order_items (
    id uuid primary key default gen_random_uuid(),
    work_order_id uuid not null references public.work_orders(id) on delete cascade,
    item_id uuid not null references public.items(id) on delete restrict,
    quantity_planned integer not null check (quantity_planned > 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (work_order_id, item_id)
);

create table if not exists public.work_logs (
    id uuid primary key default gen_random_uuid(),
    work_order_id uuid not null references public.work_orders(id) on delete cascade,
    profile_id uuid references public.profiles(id) on delete set null,
    work_time numeric default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 5. Security helpers and business functions
create or replace function public.is_approved_user()
returns boolean
language sql
security definer
set search_path = public
as $$
    select (auth.jwt() -> 'app_metadata' ->> 'permission') is not null;
$$;

create or replace function public.has_permission(allowed_permissions text[])
returns boolean
language sql
security definer
set search_path = public
as $$
    select coalesce(auth.jwt() -> 'app_metadata' ->> 'permission', '') = any (allowed_permissions);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists on_set_updated_at_staff_level on public.staff_level;
create trigger on_set_updated_at_staff_level
before update on public.staff_level
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_profiles on public.profiles;
create trigger on_set_updated_at_profiles
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_item_categories on public.item_categories;
create trigger on_set_updated_at_item_categories
before update on public.item_categories
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_vendors on public.vendors;
create trigger on_set_updated_at_vendors
before update on public.vendors
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_items on public.items;
create trigger on_set_updated_at_items
before update on public.items
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_bom on public.bom;
create trigger on_set_updated_at_bom
before update on public.bom
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_work_orders on public.work_orders;
create trigger on_set_updated_at_work_orders
before update on public.work_orders
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_work_order_items on public.work_order_items;
create trigger on_set_updated_at_work_order_items
before update on public.work_order_items
for each row
execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_work_logs on public.work_logs;
create trigger on_set_updated_at_work_logs
before update on public.work_logs
for each row
execute function public.set_updated_at();

create or replace function public.current_profile_staff_level_id()
returns uuid
language sql
security definer
set search_path = public
as $$
    select p.staff_level_id
    from public.profiles p
    where p.id = auth.uid();
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin_staff_level_id uuid;
    v_auth_user_count bigint;
begin
    select count(*)
    into v_auth_user_count
    from auth.users;

    if v_auth_user_count = 1 then
        select id
        into v_admin_staff_level_id
        from public.staff_level
        where permission_name = 'admin'
        limit 1;

        if v_admin_staff_level_id is null then
            raise exception 'Admin staff level not found';
        end if;
    end if;

    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

    if v_auth_user_count = 1 then
        update public.profiles
        set staff_level_id = v_admin_staff_level_id,
            updated_at = now()
        where id = new.id;
    end if;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.sync_user_permission_claim()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
    v_permission_name text;
begin
    select permission_name
    into v_permission_name
    from public.staff_level
    where id = new.staff_level_id;

    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('permission', v_permission_name)
    where id = new.id;

    return new;
end;
$$;

drop trigger if exists on_profile_permission_change on public.profiles;
create trigger on_profile_permission_change
after insert or update of staff_level_id on public.profiles
for each row
execute function public.sync_user_permission_claim();

create or replace function public.approve_user(user_email text, role_name text default 'staff')
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
    v_user_id uuid;
    v_staff_level_id uuid;
begin
    if not public.has_permission(array['admin']) then
        raise exception 'Only admins can approve users';
    end if;

    select id into v_user_id
    from auth.users
    where email = user_email;

    if v_user_id is null then
        return 'Error: User ' || user_email || ' not found in auth.users.';
    end if;

    select id into v_staff_level_id
    from public.staff_level
    where permission_name = role_name
    limit 1;

    if v_staff_level_id is null then
        return 'Error: Role ' || role_name || ' not found in public.staff_level.';
    end if;

    insert into public.profiles (id, staff_level_id, updated_at)
    values (v_user_id, v_staff_level_id, now())
    on conflict (id) do update
    set staff_level_id = excluded.staff_level_id,
        updated_at = now();

    return 'Success: User ' || user_email || ' has been approved as ' || role_name;
end;
$$;

create or replace function public.complete_work_order(p_work_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    wo_item record;
    bom_record record;
    current_wo_status text;
    current_stock_amount numeric;
    reserved_stock_amount numeric;
    required_stock numeric;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to complete work orders';
    end if;

    select status
    into current_wo_status
    from public.work_orders
    where id = p_work_order_id
    for update;

    if current_wo_status is null then
        raise exception 'Work Order not found';
    end if;

    if current_wo_status = 'completed' then
        raise exception 'Work Order is already completed';
    end if;

    if current_wo_status = 'cancelled' then
        raise exception 'Cancelled work orders cannot be completed';
    end if;

    perform set_config('app.complete_work_order', 'true', true);

    update public.work_orders
    set status = 'completed',
        updated_at = now()
    where id = p_work_order_id;

    for wo_item in
        select *
        from public.work_order_items
        where work_order_id = p_work_order_id
    loop
        update public.items
        set current_stock = current_stock + wo_item.quantity_planned,
            updated_at = now()
        where id = wo_item.item_id;

        for bom_record in
            select *
            from public.bom
            where parent_item_id = wo_item.item_id
        loop
            required_stock := bom_record.quantity * wo_item.quantity_planned;

            select current_stock, reserved_stock
            into strict current_stock_amount, reserved_stock_amount
            from public.items
            where id = bom_record.child_item_id
            for update;

            if reserved_stock_amount < required_stock then
                raise exception 'Insufficient reserved stock for item %', bom_record.child_item_id;
            end if;

            if current_stock_amount < required_stock then
                raise exception 'Insufficient stock for item %', bom_record.child_item_id;
            end if;

            update public.items
            set current_stock = current_stock - required_stock,
                reserved_stock = reserved_stock - required_stock,
                updated_at = now()
            where id = bom_record.child_item_id;
        end loop;
    end loop;
end;
$$;

create or replace function public.reserve_work_order_item_materials(
    p_work_order_id uuid,
    p_item_id uuid,
    p_quantity_planned numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    work_order_status text;
    bom_record record;
    required_stock numeric;
    current_stock_amount numeric;
    reserved_stock_amount numeric;
begin
    select status
    into work_order_status
    from public.work_orders
    where id = p_work_order_id
    for update;

    if work_order_status is null then
        raise exception 'Work order not found';
    end if;

    if work_order_status in ('completed', 'cancelled') then
        raise exception 'Work order items cannot be changed when the work order is %', work_order_status;
    end if;

    for bom_record in
        select child_item_id, quantity
        from public.bom
        where parent_item_id = p_item_id
        order by child_item_id
    loop
        required_stock := bom_record.quantity * p_quantity_planned;

        select current_stock, reserved_stock
        into strict current_stock_amount, reserved_stock_amount
        from public.items
        where id = bom_record.child_item_id
        for update;

        if current_stock_amount - reserved_stock_amount < required_stock then
            raise exception 'Insufficient available stock for item %', bom_record.child_item_id;
        end if;
    end loop;

    for bom_record in
        select child_item_id, quantity
        from public.bom
        where parent_item_id = p_item_id
        order by child_item_id
    loop
        required_stock := bom_record.quantity * p_quantity_planned;

        update public.items
        set reserved_stock = reserved_stock + required_stock,
            updated_at = now()
        where id = bom_record.child_item_id;
    end loop;
end;
$$;

create or replace function public.release_work_order_item_materials(
    p_item_id uuid,
    p_quantity_planned numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    bom_record record;
    required_stock numeric;
    reserved_stock_amount numeric;
begin
    for bom_record in
        select child_item_id, quantity
        from public.bom
        where parent_item_id = p_item_id
        order by child_item_id
    loop
        required_stock := bom_record.quantity * p_quantity_planned;

        select reserved_stock
        into strict reserved_stock_amount
        from public.items
        where id = bom_record.child_item_id
        for update;

        if reserved_stock_amount < required_stock then
            raise exception 'Reserved stock is lower than required for item %', bom_record.child_item_id;
        end if;

        update public.items
        set reserved_stock = reserved_stock - required_stock,
            updated_at = now()
        where id = bom_record.child_item_id;
    end loop;
end;
$$;

create or replace function public.sync_work_order_item_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    work_order_status text;
begin
    if tg_op = 'INSERT' then
        perform public.reserve_work_order_item_materials(new.work_order_id, new.item_id, new.quantity_planned);
        return new;
    elsif tg_op = 'UPDATE' then
        select status
        into work_order_status
        from public.work_orders
        where id = old.work_order_id
        for update;

        if work_order_status in ('completed', 'cancelled') then
            raise exception 'Work order items cannot be changed when the work order is %', work_order_status;
        end if;

        perform public.release_work_order_item_materials(old.item_id, old.quantity_planned);
        perform public.reserve_work_order_item_materials(new.work_order_id, new.item_id, new.quantity_planned);
        return new;
    else
        select status
        into work_order_status
        from public.work_orders
        where id = old.work_order_id
        for update;

        if work_order_status in ('completed', 'cancelled') then
            raise exception 'Work order items cannot be changed when the work order is %', work_order_status;
        end if;

        perform public.release_work_order_item_materials(old.item_id, old.quantity_planned);
        return old;
    end if;
end;
$$;

create or replace function public.release_work_order_reservations(p_work_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    work_order_item record;
begin
    for work_order_item in
        select item_id, quantity_planned
        from public.work_order_items
        where work_order_id = p_work_order_id
    loop
        perform public.release_work_order_item_materials(work_order_item.item_id, work_order_item.quantity_planned);
    end loop;
end;
$$;

create or replace function public.handle_work_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if old.status = 'completed' and new.status is distinct from old.status then
        raise exception 'Completed work orders cannot change status';
    end if;

    if new.status = 'completed'
       and current_setting('app.complete_work_order', true) is distinct from 'true' then
        raise exception 'Use complete_work_order() to complete work orders';
    end if;

    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
        perform public.release_work_order_reservations(old.id);
    end if;

    return new;
end;
$$;

drop trigger if exists on_work_order_item_reservations on public.work_order_items;
create trigger on_work_order_item_reservations
after insert or update or delete on public.work_order_items
for each row
execute function public.sync_work_order_item_reservations();

drop trigger if exists on_work_order_status_change on public.work_orders;
create trigger on_work_order_status_change
before update of status on public.work_orders
for each row
execute function public.handle_work_order_status_change();

-- 6. Views
create or replace view public.items_view with (security_invoker = true) as
select
    i.*,
    c.name as category_name,
    v.name as vendor_name
from public.items i
left join public.item_categories c on i.category_id = c.id
left join public.vendors v on i.vendor_id = v.id;

create or replace view public.work_order_summaries with (security_invoker = true) as
select
    wo.id,
    wo.reference_number,
    wo.status,
    string_agg(
        concat_ws(' | ', i.name ) || ' (' || woi.quantity_planned || ')',
        ', '
    ) as description
from public.work_orders wo
left join public.work_order_items woi on wo.id = woi.work_order_id
left join public.items i on woi.item_id = i.id
group by wo.id;

-- 7. RLS
alter table public.staff_level enable row level security;
alter table public.profiles enable row level security;
alter table public.item_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.items enable row level security;
alter table public.bom enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_items enable row level security;
alter table public.work_logs enable row level security;

drop policy if exists "Read access for authenticated" on public.staff_level;
create policy "Read access for authenticated" on public.staff_level
for select
using (auth.role() = 'authenticated');

drop policy if exists "Read access for authenticated" on public.profiles;
drop policy if exists "Profiles self or admin read" on public.profiles;
create policy "Profiles self or admin read" on public.profiles
for select
using (
    auth.uid() = id
    or public.has_permission(array['admin', 'supervisor'])
);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update
using (
    auth.uid() = id
    or public.has_permission(array['admin', 'supervisor'])
)
with check (
    public.has_permission(array['admin', 'supervisor'])
    or (
        auth.uid() = id
        and staff_level_id is not distinct from public.current_profile_staff_level_id()
    )
);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
for insert
with check (
    public.has_permission(array['admin', 'supervisor'])
    or (
        auth.uid() = id
        and staff_level_id is null
    )
);

drop policy if exists "Approved users can view categories" on public.item_categories;
create policy "Approved users can view categories" on public.item_categories
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage categories" on public.item_categories;
create policy "Approved users can manage categories" on public.item_categories
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

drop policy if exists "Approved users can view vendors" on public.vendors;
create policy "Approved users can view vendors" on public.vendors
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage vendors" on public.vendors;
create policy "Approved users can manage vendors" on public.vendors
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

drop policy if exists "Approved users can view items" on public.items;
create policy "Approved users can view items" on public.items
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage items" on public.items;
create policy "Approved users can manage items" on public.items
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

drop policy if exists "Approved users can view bom" on public.bom;
create policy "Approved users can view bom" on public.bom
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage bom" on public.bom;
create policy "Approved users can manage bom" on public.bom
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

drop policy if exists "Approved users can view work orders" on public.work_orders;
create policy "Approved users can view work orders" on public.work_orders
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage work orders" on public.work_orders;
create policy "Approved users can manage work orders" on public.work_orders
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

drop policy if exists "Approved users can view work order items" on public.work_order_items;
create policy "Approved users can view work order items" on public.work_order_items
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage work_order items" on public.work_order_items;
drop policy if exists "Approved users can manage work order items" on public.work_order_items;
create policy "Approved users can manage work order items" on public.work_order_items
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

drop policy if exists "Approved users can view logs" on public.work_logs;
create policy "Approved users can view logs" on public.work_logs
for select
using (public.is_approved_user());

drop policy if exists "Approved users can create logs" on public.work_logs;
create policy "Approved users can create logs" on public.work_logs
for insert
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

-- 8. Grants
grant usage on schema public to authenticated;

grant select on public.staff_level to authenticated;
grant select, insert, update on public.profiles to authenticated;

grant select, insert, update, delete on public.item_categories to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.bom to authenticated;
grant select, insert, update, delete on public.work_orders to authenticated;
grant select, insert, update, delete on public.work_order_items to authenticated;
grant select, insert on public.work_logs to authenticated;

grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.current_profile_staff_level_id() from public;
revoke all on function public.approve_user(text, text) from public;
revoke all on function public.complete_work_order(uuid) from public;

grant execute on function public.approve_user(text, text) to authenticated;
grant execute on function public.complete_work_order(uuid) to authenticated;

grant select on public.items_view to authenticated, service_role;
grant select on public.work_order_summaries to authenticated, service_role;

grant usage on schema public to service_role;

grant select on public.staff_level to service_role;
grant select on public.profiles to service_role;
grant select on public.item_categories to service_role;
grant select on public.vendors to service_role;
grant select on public.items to service_role;
grant select on public.bom to service_role;
grant select on public.work_orders to service_role;
grant select on public.work_order_items to service_role;
grant select on public.work_logs to service_role;

grant usage, select on all sequences in schema public to service_role;

revoke select on public.items_view from anon;
revoke select on public.work_order_summaries from anon;

-- 9. Indexes
create index if not exists idx_items_sku on public.items(sku);
create index if not exists idx_items_category_id on public.items(category_id);
create index if not exists idx_items_vendor_id on public.items(vendor_id);
create index if not exists idx_bom_parent on public.bom(parent_item_id);
create index if not exists idx_bom_child on public.bom(child_item_id);
create index if not exists idx_wo_status on public.work_orders(status);
