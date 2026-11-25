-- Dispatch edits replace allocations atomically; deletion restores stock.
-- Table writes remain RPC-only. Expected timestamps prevent stale UI writes.
create or replace function public.save_dispatch(
    p_dispatch_id uuid,
    p_dispatch jsonb,
    p_batches jsonb,
    p_expected_updated_at timestamp with time zone
)
returns public.dispatches
language plpgsql
security definer
set search_path = public
as $$
declare
    v_dispatch public.dispatches;
    v_customer_name text;
    v_item_ids uuid[];
    v_batch record;
    v_item_id uuid;
    v_available numeric;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to save dispatches';
    end if;

    if p_dispatch is null or jsonb_typeof(p_dispatch) <> 'object' then
        raise exception 'Dispatch details must be a JSON object';
    end if;
    if p_batches is null or jsonb_typeof(p_batches) <> 'array' then
        raise exception 'Dispatch batches must be a JSON array';
    end if;
    if jsonb_array_length(p_batches) = 0 then
        raise exception 'A dispatch must include at least one batch';
    end if;
    if exists (
        select 1 from jsonb_array_elements(p_batches) as entries(entry)
        where jsonb_typeof(entry) <> 'object'
           or nullif(entry->>'item_batch_id', '') is null
           or jsonb_typeof(entry->'quantity') is distinct from 'number'
    ) then
        raise exception 'Each dispatch batch must include an item_batch_id and numeric quantity';
    end if;
    if exists (
        select 1
        from jsonb_to_recordset(p_batches) as entries(item_batch_id uuid, quantity numeric)
        where quantity <= 0 or quantity >= 'Infinity'::numeric
    ) then
        raise exception 'Dispatch quantities must be positive and finite';
    end if;
    if exists (
        select item_batch_id
        from jsonb_to_recordset(p_batches) as entries(item_batch_id uuid, quantity numeric)
        group by item_batch_id having count(*) > 1
    ) then
        raise exception 'Each batch may appear only once in a dispatch';
    end if;

    if p_dispatch_id is not null then
        select * into v_dispatch from public.dispatches
        where id = p_dispatch_id for update;
        if not found then
            raise exception 'Dispatch not found';
        end if;
        if v_dispatch.updated_at is distinct from p_expected_updated_at then
            raise exception 'Dispatch changed since it was loaded. Reload before saving.';
        end if;
    end if;

    select name into v_customer_name from public.customers
    where id = (p_dispatch->>'customer_id')::uuid for share;
    if not found then
        raise exception 'Customer not found';
    end if;
    -- Keep the historical customer name unless the customer is changed.
    if v_dispatch.customer_id = (p_dispatch->>'customer_id')::uuid then
        v_customer_name := v_dispatch.customer_name;
    end if;

    select coalesce(array_agg(distinct b.item_id order by b.item_id), '{}'::uuid[])
    into v_item_ids
    from public.item_batches b
    where b.id in (
        select item_batch_id from public.dispatch_item_batches where dispatch_id = p_dispatch_id
        union
        select item_batch_id
        from jsonb_to_recordset(p_batches) as entries(item_batch_id uuid, quantity numeric)
    );
    perform 1 from public.items where id = any(v_item_ids) order by id for update;

    -- Apply net changes, crediting this dispatch's old quantities but never
    -- consuming stock reserved by work orders.
    for v_batch in
        select coalesce(old_lines.item_batch_id, new_lines.item_batch_id) as item_batch_id,
               coalesce(old_lines.quantity, 0) as old_quantity,
               coalesce(new_lines.quantity, 0) as new_quantity
        from (
            select item_batch_id, quantity from public.dispatch_item_batches
            where dispatch_id = p_dispatch_id
        ) old_lines
        full join jsonb_to_recordset(p_batches) as new_lines(item_batch_id uuid, quantity numeric)
            on new_lines.item_batch_id = old_lines.item_batch_id
        order by item_batch_id
    loop
        select item_id, quantity - reserved into v_item_id, v_available
        from public.item_batches where id = v_batch.item_batch_id for update;
        if not found then
            raise exception 'Item batch % not found', v_batch.item_batch_id;
        end if;
        if not (v_item_id = any(v_item_ids)) then
            raise exception 'Item batch % changed item; reload dispatch', v_batch.item_batch_id;
        end if;
        if v_batch.new_quantity > v_available + v_batch.old_quantity then
            raise exception 'Insufficient unreserved stock in batch % (available: %, requested: %)',
                v_batch.item_batch_id, v_available + v_batch.old_quantity, v_batch.new_quantity;
        end if;
        update public.item_batches
        set quantity = quantity + v_batch.old_quantity - v_batch.new_quantity,
            updated_at = now()
        where id = v_batch.item_batch_id;
    end loop;

    if p_dispatch_id is null then
        insert into public.dispatches (
            dispatch_date, customer_id, customer_name, packaging_intact,
            vehicle_clean_and_free_from_pests_and_contamination, product_temperature_celsius
        ) values (
            (p_dispatch->>'dispatch_date')::date,
            (p_dispatch->>'customer_id')::uuid, v_customer_name,
            (p_dispatch->>'packaging_intact')::boolean,
            (p_dispatch->>'vehicle_clean_and_free_from_pests_and_contamination')::boolean,
            (p_dispatch->>'product_temperature_celsius')::numeric
        ) returning * into v_dispatch;
    else
        update public.dispatches
        set dispatch_date = (p_dispatch->>'dispatch_date')::date,
            customer_id = (p_dispatch->>'customer_id')::uuid,
            customer_name = v_customer_name,
            packaging_intact = (p_dispatch->>'packaging_intact')::boolean,
            vehicle_clean_and_free_from_pests_and_contamination =
                (p_dispatch->>'vehicle_clean_and_free_from_pests_and_contamination')::boolean,
            product_temperature_celsius = (p_dispatch->>'product_temperature_celsius')::numeric,
            updated_at = now()
        where id = p_dispatch_id returning * into v_dispatch;
        delete from public.dispatch_item_batches where dispatch_id = p_dispatch_id;
    end if;

    insert into public.dispatch_item_batches (dispatch_id, item_batch_id, quantity)
    select v_dispatch.id, item_batch_id, quantity
    from jsonb_to_recordset(p_batches) as entries(item_batch_id uuid, quantity numeric);
    return v_dispatch;
end;
$$;

create or replace function public.create_dispatch(p_dispatch jsonb, p_batches jsonb)
returns public.dispatches
language sql
security definer
set search_path = public
as $$
    select public.save_dispatch(null, p_dispatch, p_batches, null);
$$;

create or replace function public.update_dispatch(
    p_dispatch_id uuid,
    p_dispatch jsonb,
    p_batches jsonb,
    p_expected_updated_at timestamp with time zone
)
returns public.dispatches
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_dispatch_id is null then
        raise exception 'Dispatch ID is required';
    end if;
    return public.save_dispatch(p_dispatch_id, p_dispatch, p_batches, p_expected_updated_at);
end;
$$;

create or replace function public.delete_dispatch(
    p_dispatch_id uuid,
    p_expected_updated_at timestamp with time zone
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_dispatch public.dispatches;
    v_item_ids uuid[];
    v_item_id uuid;
    v_batch record;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to delete dispatches';
    end if;
    select * into v_dispatch from public.dispatches where id = p_dispatch_id for update;
    if not found then
        raise exception 'Dispatch not found';
    end if;
    if v_dispatch.updated_at is distinct from p_expected_updated_at then
        raise exception 'Dispatch changed since it was loaded. Reload before deleting.';
    end if;

    select coalesce(array_agg(distinct b.item_id order by b.item_id), '{}'::uuid[])
    into v_item_ids from public.item_batches b
    join public.dispatch_item_batches d on d.item_batch_id = b.id
    where d.dispatch_id = p_dispatch_id;
    perform 1 from public.items where id = any(v_item_ids) order by id for update;

    for v_batch in
        select item_batch_id, quantity from public.dispatch_item_batches
        where dispatch_id = p_dispatch_id order by item_batch_id
    loop
        select item_id into v_item_id from public.item_batches
        where id = v_batch.item_batch_id for update;
        if not found then
            raise exception 'Item batch % not found', v_batch.item_batch_id;
        end if;
        if not (v_item_id = any(v_item_ids)) then
            raise exception 'Item batch % changed item; reload dispatch', v_batch.item_batch_id;
        end if;
        update public.item_batches
        set quantity = quantity + v_batch.quantity, updated_at = now()
        where id = v_batch.item_batch_id;
    end loop;

    delete from public.dispatch_item_batches where dispatch_id = p_dispatch_id;
    delete from public.dispatches where id = p_dispatch_id;
end;
$$;

revoke all on function public.save_dispatch(uuid, jsonb, jsonb, timestamp with time zone)
    from public, anon, authenticated;
revoke all on function public.create_dispatch(jsonb, jsonb) from public, anon;
revoke all on function public.update_dispatch(uuid, jsonb, jsonb, timestamp with time zone)
    from public, anon;
revoke all on function public.delete_dispatch(uuid, timestamp with time zone) from public, anon;
grant execute on function public.create_dispatch(jsonb, jsonb),
    public.update_dispatch(uuid, jsonb, jsonb, timestamp with time zone),
    public.delete_dispatch(uuid, timestamp with time zone)
    to authenticated, service_role;
