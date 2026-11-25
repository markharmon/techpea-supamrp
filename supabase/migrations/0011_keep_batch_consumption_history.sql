-- Keep work_order_item_batches as a historical record of which batches were
-- consumed by a completed work order item, instead of deleting them.
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
        -- Consume the reserved batches. The work_order_item_batches rows are kept
        -- as a permanent record of which batches were used (reserved is cleared,
        -- quantity is deducted, but the allocation row itself is not deleted).
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
