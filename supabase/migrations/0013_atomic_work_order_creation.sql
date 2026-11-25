-- Create a work order and its items atomically so a failed material
-- reservation (insufficient batch stock) rolls back the whole work order
-- instead of leaving an empty work order saved with no items.
create or replace function public.create_work_order_with_items(
    p_work_order jsonb,
    p_items jsonb
)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_work_order public.work_orders;
    v_item jsonb;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to create work orders';
    end if;

    insert into public.work_orders (status, notes, due_date)
    values (
        coalesce(p_work_order->>'status', 'planned'),
        p_work_order->>'notes',
        nullif(p_work_order->>'due_date', '')::date
    )
    returning * into v_work_order;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        insert into public.work_order_items (work_order_id, item_id, quantity_planned)
        values (
            v_work_order.id,
            (v_item->>'item_id')::uuid,
            (v_item->>'quantity_planned')::numeric
        );
    end loop;

    return v_work_order;
end;
$$;

revoke all on function public.create_work_order_with_items(jsonb, jsonb) from public;
grant execute on function public.create_work_order_with_items(jsonb, jsonb) to authenticated;
