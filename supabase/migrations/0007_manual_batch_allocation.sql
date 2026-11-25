-- Manual batch allocation override: lets a user replace the auto-selected
-- batches for a single BOM ingredient of a work order item.
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

    select quantity into v_bom_quantity
    from public.bom
    where parent_item_id = v_parent_item_id
      and child_item_id = p_child_item_id;

    if v_bom_quantity is null then
        raise exception 'Item % is not a BOM component of this work order item', p_child_item_id;
    end if;

    v_required := v_bom_quantity * v_quantity_planned;

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

revoke all on function public.set_work_order_item_batch_allocations(uuid, uuid, jsonb) from public;
grant execute on function public.set_work_order_item_batch_allocations(uuid, uuid, jsonb) to authenticated;
