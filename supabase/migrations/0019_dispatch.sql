-- Dispatches are immutable stock movements created through create_dispatch.
-- Quantities use the item's stock unit; product temperature is in Celsius.
create table if not exists public.customers (
    id uuid primary key default gen_random_uuid(),
    name text not null unique check (btrim(name) <> ''),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table if not exists public.dispatches (
    id uuid primary key default gen_random_uuid(),
    dispatch_date date not null,
    customer_id uuid not null references public.customers(id) on delete restrict,
    customer_name text not null check (btrim(customer_name) <> ''),
    packaging_intact boolean not null,
    vehicle_clean_and_free_from_pests_and_contamination boolean not null,
    product_temperature_celsius numeric not null check (
        product_temperature_celsius > '-Infinity'::numeric
        and product_temperature_celsius < 'Infinity'::numeric
    ),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

-- Each line identifies its item through the batch, allowing multiple items
-- and multiple whole or partial batches of each item in one dispatch.
create table if not exists public.dispatch_item_batches (
    id uuid primary key default gen_random_uuid(),
    dispatch_id uuid not null references public.dispatches(id) on delete restrict,
    item_batch_id uuid not null references public.item_batches(id) on delete restrict,
    quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    unique (dispatch_id, item_batch_id)
);

drop trigger if exists on_set_updated_at_customers on public.customers;
create trigger on_set_updated_at_customers
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_dispatches on public.dispatches;
create trigger on_set_updated_at_dispatches
before update on public.dispatches
for each row execute function public.set_updated_at();

drop trigger if exists on_set_updated_at_dispatch_item_batches on public.dispatch_item_batches;
create trigger on_set_updated_at_dispatch_item_batches
before update on public.dispatch_item_batches
for each row execute function public.set_updated_at();

-- p_dispatch supplies the header fields (except customer_name, which is
-- snapshotted from customers). p_batches is an array of
-- {"item_batch_id": "<uuid>", "quantity": <positive stock units>}.
create or replace function public.create_dispatch(p_dispatch jsonb, p_batches jsonb)
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
    v_available numeric;
    v_item_id uuid;
begin
    if not public.has_permission(array['admin', 'supervisor', 'staff']) then
        raise exception 'Insufficient permissions to create dispatches';
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
        select 1
        from jsonb_array_elements(p_batches) as entries(entry)
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
        group by item_batch_id
        having count(*) > 1
    ) then
        raise exception 'Each batch may appear only once in a dispatch';
    end if;

    select name into v_customer_name
    from public.customers
    where id = (p_dispatch->>'customer_id')::uuid
    for share;

    if not found then
        raise exception 'Customer not found';
    end if;

    -- Lock item rows before batches, matching work order reservations and
    -- serializing stock-cache updates for dispatches sharing the same items.
    select coalesce(array_agg(distinct b.item_id order by b.item_id), '{}'::uuid[])
    into v_item_ids
    from public.item_batches b
    join jsonb_to_recordset(p_batches) as entries(item_batch_id uuid, quantity numeric)
        on entries.item_batch_id = b.id;

    perform 1 from public.items
    where id = any(v_item_ids)
    order by id
    for update;

    insert into public.dispatches (
        dispatch_date, customer_id, customer_name, packaging_intact,
        vehicle_clean_and_free_from_pests_and_contamination, product_temperature_celsius
    )
    values (
        (p_dispatch->>'dispatch_date')::date,
        (p_dispatch->>'customer_id')::uuid,
        v_customer_name,
        (p_dispatch->>'packaging_intact')::boolean,
        (p_dispatch->>'vehicle_clean_and_free_from_pests_and_contamination')::boolean,
        (p_dispatch->>'product_temperature_celsius')::numeric
    )
    returning * into v_dispatch;

    for v_batch in
        select item_batch_id, quantity
        from jsonb_to_recordset(p_batches) as entries(item_batch_id uuid, quantity numeric)
        order by item_batch_id
    loop
        select item_id, quantity - reserved into v_item_id, v_available
        from public.item_batches
        where id = v_batch.item_batch_id
        for update;

        if not found then
            raise exception 'Item batch % not found', v_batch.item_batch_id;
        end if;

        if not (v_item_id = any(v_item_ids)) then
            raise exception 'Item batch % changed item; retry dispatch', v_batch.item_batch_id;
        end if;

        if v_batch.quantity > v_available then
            raise exception 'Insufficient unreserved stock in batch % (available: %, requested: %)',
                v_batch.item_batch_id, v_available, v_batch.quantity;
        end if;

        update public.item_batches
        set quantity = quantity - v_batch.quantity,
            updated_at = now()
        where id = v_batch.item_batch_id;

        insert into public.dispatch_item_batches (dispatch_id, item_batch_id, quantity)
        values (v_dispatch.id, v_batch.item_batch_id, v_batch.quantity);
    end loop;

    return v_dispatch;
end;
$$;

alter table public.customers enable row level security;
alter table public.dispatches enable row level security;
alter table public.dispatch_item_batches enable row level security;

drop policy if exists "Approved users can view customers" on public.customers;
create policy "Approved users can view customers" on public.customers
for select to authenticated
using ((select public.is_approved_user()));

drop policy if exists "Staff can manage customers" on public.customers;
create policy "Staff can manage customers" on public.customers
for all to authenticated
using ((select public.has_permission(array['admin', 'supervisor', 'staff'])))
with check ((select public.has_permission(array['admin', 'supervisor', 'staff'])));

drop policy if exists "Approved users can view dispatches" on public.dispatches;
create policy "Approved users can view dispatches" on public.dispatches
for select to authenticated
using ((select public.is_approved_user()));

drop policy if exists "Approved users can view dispatch item batches" on public.dispatch_item_batches;
create policy "Approved users can view dispatch item batches" on public.dispatch_item_batches
for select to authenticated
using ((select public.is_approved_user()));

grant select, insert, update, delete on public.customers to authenticated;
-- Override any default table grants; dispatch writes must go through the RPC.
revoke all on public.dispatches, public.dispatch_item_batches from anon, authenticated;
grant select on public.dispatches, public.dispatch_item_batches to authenticated;
revoke all on function public.create_dispatch(jsonb, jsonb) from public, anon;
grant execute on function public.create_dispatch(jsonb, jsonb) to authenticated, service_role;

create index if not exists idx_dispatches_customer_id on public.dispatches(customer_id);
create index if not exists idx_dispatches_dispatch_date on public.dispatches(dispatch_date);
create index if not exists idx_dispatch_item_batches_item_batch_id
    on public.dispatch_item_batches(item_batch_id);