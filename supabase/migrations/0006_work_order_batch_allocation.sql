-- Batch-aware work order reservation: allocate specific item_batches (oldest first)
-- to each work_order_item's BOM requirements, and produce output batches on completion.
-- items.current_stock/reserved_stock become derived caches synced from item_batches.

create table if not exists public.work_order_item_batches (
    id uuid primary key default gen_random_uuid(),
    work_order_item_id uuid not null references public.work_order_items(id) on delete cascade,
    item_batch_id uuid not null references public.item_batches(id) on delete restrict,
    quantity numeric not null check (quantity > 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (work_order_item_id, item_batch_id)
);

create index if not exists idx_work_order_item_batches_work_order_item_id on public.work_order_item_batches(work_order_item_id);
create index if not exists idx_work_order_item_batches_item_batch_id on public.work_order_item_batches(item_batch_id);
create index if not exists idx_item_batches_item_id_manufacture_date on public.item_batches(item_id, manufacture_date);

drop trigger if exists on_set_updated_at_work_order_item_batches on public.work_order_item_batches;
create trigger on_set_updated_at_work_order_item_batches
before update on public.work_order_item_batches
for each row
execute function public.set_updated_at();

-- RLS: allocations are managed by security definer functions, not written to directly.
alter table public.work_order_item_batches enable row level security;

drop policy if exists "Approved users can view work order item batches" on public.work_order_item_batches;
create policy "Approved users can view work order item batches" on public.work_order_item_batches
for select
using (public.is_approved_user());

grant select on public.work_order_item_batches to authenticated;

-- Keep items.current_stock/reserved_stock as a derived cache of item_batches.
create or replace function public.sync_item_stock_from_batches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        update public.items
        set current_stock = coalesce((select sum(quantity) from public.item_batches where item_id = old.item_id), 0),
            reserved_stock = coalesce((select sum(reserved) from public.item_batches where item_id = old.item_id), 0),
            updated_at = now()
        where id = old.item_id;
        return old;
    end if;

    update public.items
    set current_stock = coalesce((select sum(quantity) from public.item_batches where item_id = new.item_id), 0),
        reserved_stock = coalesce((select sum(reserved) from public.item_batches where item_id = new.item_id), 0),
        updated_at = now()
    where id = new.item_id;

    if tg_op = 'UPDATE' and old.item_id is distinct from new.item_id then
        update public.items
        set current_stock = coalesce((select sum(quantity) from public.item_batches where item_id = old.item_id), 0),
            reserved_stock = coalesce((select sum(reserved) from public.item_batches where item_id = old.item_id), 0),
            updated_at = now()
        where id = old.item_id;
    end if;

    return new;
end;
$$;

drop trigger if exists on_item_batches_sync_item_stock on public.item_batches;
create trigger on_item_batches_sync_item_stock
after insert or update or delete on public.item_batches
for each row
execute function public.sync_item_stock_from_batches();

-- Reserve BOM materials for a work order item by allocating specific batches,
-- oldest batch with remaining stock first (FIFO by manufacture date).
-- Dropped first: the first parameter is renamed from the old (uuid, uuid, numeric) signature.
drop function if exists public.reserve_work_order_item_materials(uuid, uuid, numeric);

create or replace function public.reserve_work_order_item_materials(
    p_work_order_item_id uuid,
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
    batch_record record;
    required_stock numeric;
    available_stock numeric;
    remaining numeric;
    allocatable numeric;
begin
    -- Validate sufficient available (unreserved) batch stock before allocating anything.
    for bom_record in
        select child_item_id, quantity
        from public.bom
        where parent_item_id = p_item_id
        order by child_item_id
    loop
        required_stock := bom_record.quantity * p_quantity_planned;

        -- Lock the child item row to serialize concurrent reservations against it.
        perform 1 from public.items where id = bom_record.child_item_id for update;

        select coalesce(sum(quantity - reserved), 0)
        into available_stock
        from public.item_batches
        where item_id = bom_record.child_item_id;

        if available_stock < required_stock then
            raise exception 'Insufficient available stock for item %', bom_record.child_item_id;
        end if;
    end loop;

    for bom_record in
        select child_item_id, quantity
        from public.bom
        where parent_item_id = p_item_id
        order by child_item_id
    loop
        remaining := bom_record.quantity * p_quantity_planned;

        for batch_record in
            select id, quantity, reserved
            from public.item_batches
            where item_id = bom_record.child_item_id
              and quantity > reserved
            order by manufacture_date asc nulls last, created_at asc
            for update
        loop
            exit when remaining <= 0;

            allocatable := least(remaining, batch_record.quantity - batch_record.reserved);

            update public.item_batches
            set reserved = reserved + allocatable,
                updated_at = now()
            where id = batch_record.id;

            insert into public.work_order_item_batches as wob (work_order_item_id, item_batch_id, quantity)
            values (p_work_order_item_id, batch_record.id, allocatable)
            on conflict (work_order_item_id, item_batch_id)
            do update set quantity = wob.quantity + excluded.quantity,
                updated_at = now();

            remaining := remaining - allocatable;
        end loop;
    end loop;
end;
$$;

-- Release all batch allocations reserved for a work order item.
-- Dropped first: the old (uuid, numeric) signature is replaced by a single-argument version.
drop function if exists public.release_work_order_item_materials(uuid, numeric);

create or replace function public.release_work_order_item_materials(
    p_work_order_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    allocation record;
begin
    for allocation in
        select item_batch_id, quantity
        from public.work_order_item_batches
        where work_order_item_id = p_work_order_item_id
        order by item_batch_id
    loop
        update public.item_batches
        set reserved = reserved - allocation.quantity,
            updated_at = now()
        where id = allocation.item_batch_id;
    end loop;

    delete from public.work_order_item_batches
    where work_order_item_id = p_work_order_item_id;
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
        perform public.reserve_work_order_item_materials(new.id, new.item_id, new.quantity_planned);
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

        perform public.release_work_order_item_materials(old.id);
        perform public.reserve_work_order_item_materials(new.id, new.item_id, new.quantity_planned);
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

        perform public.release_work_order_item_materials(old.id);
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
        select id
        from public.work_order_items
        where work_order_id = p_work_order_id
    loop
        perform public.release_work_order_item_materials(work_order_item.id);
    end loop;
end;
$$;

-- Complete a work order: consume allocated ingredient batches and produce
-- output batches for each produced item, sized to the item's batch_size.
create or replace function public.complete_work_order(p_work_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    wo_item record;
    allocation record;
    current_wo_status text;
    v_batch_size numeric;
    v_remaining numeric;
    v_batch_qty numeric;
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
        for allocation in
            select item_batch_id, quantity
            from public.work_order_item_batches
            where work_order_item_id = wo_item.id
            order by item_batch_id
        loop
            update public.item_batches
            set quantity = quantity - allocation.quantity,
                reserved = reserved - allocation.quantity,
                updated_at = now()
            where id = allocation.item_batch_id;
        end loop;

        delete from public.work_order_item_batches
        where work_order_item_id = wo_item.id;

        select batch_size
        into v_batch_size
        from public.items
        where id = wo_item.item_id;

        v_remaining := wo_item.quantity_planned;

        if v_batch_size is null or v_batch_size <= 0 then
            insert into public.item_batches (item_id, manufacture_date, quantity)
            values (wo_item.item_id, current_date, v_remaining);
        else
            while v_remaining > 0 loop
                v_batch_qty := least(v_batch_size, v_remaining);

                insert into public.item_batches (item_id, manufacture_date, quantity)
                values (wo_item.item_id, current_date, v_batch_qty);

                v_remaining := v_remaining - v_batch_qty;
            end loop;
        end if;
    end loop;
end;
$$;
