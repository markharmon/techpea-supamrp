-- work_order_items.quantity_planned now means "batches to create" for the produced item,
-- not a raw quantity. Material requirements and completion output scale by item.batch_size.
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
    v_item_batch_size numeric;
    required_stock numeric;
    available_stock numeric;
    remaining numeric;
    allocatable numeric;
begin
    select batch_size
    into v_item_batch_size
    from public.items
    where id = p_item_id;

    if v_item_batch_size is null or v_item_batch_size <= 0 then
        raise exception 'Item % does not have a batch size defined', p_item_id;
    end if;

    -- Validate sufficient available (unreserved) batch stock before allocating anything.
    for bom_record in
        select child_item_id, quantity
        from public.bom
        where parent_item_id = p_item_id
        order by child_item_id
    loop
        required_stock := bom_record.quantity * v_item_batch_size * p_quantity_planned;

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
        remaining := bom_record.quantity * v_item_batch_size * p_quantity_planned;

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

-- Complete a work order: consume allocated ingredient batches and produce
-- `quantity_planned` output batches for each produced item, each sized to batch_size.
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
    v_batch_count integer;
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

        if v_batch_size is null or v_batch_size <= 0 then
            raise exception 'Item % does not have a batch size defined', wo_item.item_id;
        end if;

        v_batch_count := wo_item.quantity_planned;

        for i in 1..v_batch_count loop
            insert into public.item_batches (item_id, manufacture_date, quantity)
            values (wo_item.item_id, current_date, v_batch_size);
        end loop;
    end loop;
end;
$$;

-- Manual batch allocation override, updated to scale required quantity by batch size.
create or replace function public.set_work_order_item_batch_allocations(
    p_work_order_item_id uuid,
    p_child_item_id uuid,
    p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_work_order_id uuid;
    v_parent_item_id uuid;
    v_quantity_planned numeric;
    v_parent_batch_size numeric;
    v_bom_quantity numeric;
    v_required numeric;
    v_status text;
    v_total numeric := 0;
    v_alloc jsonb;
    v_batch_id uuid;
    v_qty numeric;
    v_available numeric;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to allocate batches';
    end if;

    select woi.work_order_id, woi.item_id, woi.quantity_planned
    into v_work_order_id, v_parent_item_id, v_quantity_planned
    from public.work_order_items woi
    where woi.id = p_work_order_item_id
    for update;

    if v_work_order_id is null then
        raise exception 'Work order item not found';
    end if;

    select status into v_status
    from public.work_orders
    where id = v_work_order_id
    for update;

    if v_status in ('completed', 'cancelled') then
        raise exception 'Work order items cannot be changed when the work order is %', v_status;
    end if;

    select batch_size into v_parent_batch_size
    from public.items
    where id = v_parent_item_id;

    if v_parent_batch_size is null or v_parent_batch_size <= 0 then
        raise exception 'Item % does not have a batch size defined', v_parent_item_id;
    end if;

    select quantity into v_bom_quantity
    from public.bom
    where parent_item_id = v_parent_item_id
      and child_item_id = p_child_item_id;

    if v_bom_quantity is null then
        raise exception 'Item % is not a BOM component of this work order item', p_child_item_id;
    end if;

    v_required := v_bom_quantity * v_parent_batch_size * v_quantity_planned;

    -- Release the existing allocations for this ingredient only (leave other ingredients untouched).
    for v_alloc in
        select jsonb_build_object('item_batch_id', wob.item_batch_id, 'quantity', wob.quantity)
        from public.work_order_item_batches wob
        join public.item_batches ib on ib.id = wob.item_batch_id
        where wob.work_order_item_id = p_work_order_item_id
          and ib.item_id = p_child_item_id
    loop
        update public.item_batches
        set reserved = reserved - (v_alloc->>'quantity')::numeric,
            updated_at = now()
        where id = (v_alloc->>'item_batch_id')::uuid;
    end loop;

    delete from public.work_order_item_batches wob
    using public.item_batches ib
    where wob.work_order_item_id = p_work_order_item_id
      and wob.item_batch_id = ib.id
      and ib.item_id = p_child_item_id;

    -- Apply the requested allocation.
    for v_alloc in select * from jsonb_array_elements(p_allocations)
    loop
        v_batch_id := (v_alloc->>'item_batch_id')::uuid;
        v_qty := (v_alloc->>'quantity')::numeric;

        if v_qty <= 0 then
            raise exception 'Allocation quantity must be greater than zero';
        end if;

        select quantity - reserved
        into v_available
        from public.item_batches
        where id = v_batch_id
          and item_id = p_child_item_id
        for update;

        if v_available is null then
            raise exception 'Batch % does not belong to item %', v_batch_id, p_child_item_id;
        end if;

        if v_available < v_qty then
            raise exception 'Batch % does not have enough available stock', v_batch_id;
        end if;

        update public.item_batches
        set reserved = reserved + v_qty,
            updated_at = now()
        where id = v_batch_id;

        insert into public.work_order_item_batches as wob (work_order_item_id, item_batch_id, quantity)
        values (p_work_order_item_id, v_batch_id, v_qty)
        on conflict (work_order_item_id, item_batch_id)
        do update set quantity = wob.quantity + excluded.quantity,
            updated_at = now();

        v_total := v_total + v_qty;
    end loop;

    if abs(v_total - v_required) > 0.0001 then
        raise exception 'Allocated quantity (%) does not match required quantity (%)', v_total, v_required;
    end if;
end;
$$;
