-- Default batch selection should prefer soonest expiry (FEFO), not oldest manufacture date.
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
            order by expiry_date asc nulls last, created_at asc
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
