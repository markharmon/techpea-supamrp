-- Completion with actual output quantities. The existing one-argument RPC is unchanged.
create or replace function public.complete_work_order(
    p_work_order_id uuid,
    p_yields jsonb,
    p_log jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    wo_item record;
    allocation record;
    v_status text;
    v_entry jsonb;
    v_item_id uuid;
    v_batch_number numeric;
    v_quantity numeric;
    v_work_time numeric;
    v_count bigint;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to complete work orders';
    end if;

    select status into v_status from public.work_orders
    where id = p_work_order_id for update;
    if v_status is null then
        raise exception 'Work Order not found';
    elsif v_status = 'completed' then
        raise exception 'Work Order is already completed';
    elsif v_status = 'cancelled' then
        raise exception 'Cancelled work orders cannot be completed';
    end if;

    perform 1 from public.work_order_items
    where work_order_id = p_work_order_id order by id for update;
    select coalesce(sum(quantity_planned), 0) into v_count
    from public.work_order_items where work_order_id = p_work_order_id;
    if v_count = 0 then
        raise exception 'Add at least one item before completing the work order';
    end if;
    if p_yields is null or jsonb_typeof(p_yields) <> 'array' then
        raise exception 'Enter a final yield for every planned batch';
    end if;
    if jsonb_array_length(p_yields) <> v_count then
        raise exception 'Planned batches have changed. Reopen final yields before completing';
    end if;

    for v_entry in select value from jsonb_array_elements(p_yields) loop
        if jsonb_typeof(v_entry) <> 'object'
           or jsonb_typeof(v_entry -> 'work_order_item_id') is distinct from 'string'
           or jsonb_typeof(v_entry -> 'batch_number') is distinct from 'number'
           or jsonb_typeof(v_entry -> 'quantity') is distinct from 'number' then
            raise exception 'Each batch requires an item, batch number and numeric final yield';
        end if;
        v_item_id := (v_entry ->> 'work_order_item_id')::uuid;
        v_batch_number := (v_entry ->> 'batch_number')::numeric;
        v_quantity := (v_entry ->> 'quantity')::numeric;
        if v_quantity < 0 or v_quantity >= 'Infinity'::numeric then
            raise exception 'Final yields must be finite and non-negative';
        end if;
        if v_batch_number <> trunc(v_batch_number) or not exists (
            select 1 from public.work_order_items
            where id = v_item_id and work_order_id = p_work_order_id
              and v_batch_number between 1 and quantity_planned
        ) then
            raise exception 'Final yield does not match a planned batch. Reopen final yields before completing';
        end if;
    end loop;
    if exists (
        select 1 from jsonb_array_elements(p_yields) entry
        group by (entry ->> 'work_order_item_id')::uuid, (entry ->> 'batch_number')::numeric
        having count(*) > 1
    ) then
        raise exception 'Enter exactly one final yield per planned batch';
    end if;

    if p_log is null or jsonb_typeof(p_log) <> 'object'
       or jsonb_typeof(p_log -> 'profile_id') is distinct from 'string'
       or jsonb_typeof(p_log -> 'work_time') is distinct from 'number' then
        raise exception 'Select a user and enter valid logged time';
    end if;
    v_work_time := (p_log ->> 'work_time')::numeric;
    if v_work_time < 0 or v_work_time >= 'Infinity'::numeric then
        raise exception 'Logged time must be finite and non-negative';
    end if;
    if length(p_log ->> 'notes') > 2000 then
        raise exception 'Notes must be no more than 2000 characters';
    end if;
    insert into public.work_logs (work_order_id, profile_id, work_time, notes)
    values (p_work_order_id, (p_log ->> 'profile_id')::uuid, v_work_time,
            nullif(btrim(p_log ->> 'notes'), ''));

    perform set_config('app.complete_work_order', 'true', true);
    update public.work_orders set status = 'completed', updated_at = now()
    where id = p_work_order_id;

    for wo_item in
        select * from public.work_order_items
        where work_order_id = p_work_order_id order by id
    loop
        -- Keep allocation history and consume the original ingredient reservation,
        -- including when a batch has zero output.
        for allocation in
            select item_batch_id, quantity from public.work_order_item_batches
            where work_order_item_id = wo_item.id order by item_batch_id
        loop
            update public.item_batches
            set quantity = quantity - allocation.quantity,
                reserved = reserved - allocation.quantity, updated_at = now()
            where id = allocation.item_batch_id;
        end loop;

        for v_entry in
            select value from jsonb_array_elements(p_yields)
            where (value ->> 'work_order_item_id')::uuid = wo_item.id
            order by (value ->> 'batch_number')::integer
        loop
            insert into public.item_batches (item_id, manufacture_date, quantity)
            values (wo_item.item_id, current_date, (v_entry ->> 'quantity')::numeric);
        end loop;
    end loop;
end;
$$;

revoke all on function public.complete_work_order(uuid, jsonb, jsonb) from public;
grant execute on function public.complete_work_order(uuid, jsonb, jsonb) to authenticated, service_role;
