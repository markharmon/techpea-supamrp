-- Purchase orders migration.
-- Adds purchase order header/lines and a helper to receive stock into inventory.

create table if not exists public.purchase_orders (
    id uuid primary key default gen_random_uuid(),
    reference_number int generated always as identity,
    vendor_id uuid references public.vendors(id) on delete set null,
    created_by uuid references public.profiles(id) on delete set null,
    status text not null default 'draft' check (status in ('draft', 'submitted', 'partially_received', 'received', 'cancelled')),
    order_date date not null default current_date,
    expected_date date,
    received_date date,
    notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists public.purchase_order_items (
    id uuid primary key default gen_random_uuid(),
    purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
    item_id uuid not null references public.items(id) on delete restrict,
    quantity_ordered numeric not null check (quantity_ordered > 0),
    quantity_received numeric not null default 0 check (quantity_received >= 0),
    unit_cost numeric not null default 0 check (unit_cost >= 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (purchase_order_id, item_id),
    check (quantity_received <= quantity_ordered)
);

create index if not exists idx_purchase_orders_vendor_id on public.purchase_orders(vendor_id);
create index if not exists idx_purchase_order_items_purchase_order_id on public.purchase_order_items(purchase_order_id);
create index if not exists idx_purchase_order_items_item_id on public.purchase_order_items(item_id);

create or replace function public.receive_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    po_status text;
    po_item record;
begin
    select status into po_status
    from public.purchase_orders
    where id = p_purchase_order_id;

    if po_status is null then
        raise exception 'Purchase Order not found';
    end if;

    if po_status in ('received', 'cancelled') then
        raise exception 'Purchase Order cannot be received in status %', po_status;
    end if;

    for po_item in
        select item_id, (quantity_ordered - quantity_received) as qty_to_receive
        from public.purchase_order_items
        where purchase_order_id = p_purchase_order_id
          and quantity_ordered > quantity_received
    loop
        update public.items
        set current_stock = current_stock + po_item.qty_to_receive
        where id = po_item.item_id;

        update public.purchase_order_items
        set quantity_received = quantity_ordered,
            updated_at = now()
        where purchase_order_id = p_purchase_order_id
          and item_id = po_item.item_id;
    end loop;

    update public.purchase_orders
    set status = 'received',
        received_date = current_date,
        updated_at = now()
    where id = p_purchase_order_id;
end;
$$;

create or replace view public.purchase_order_summaries as
select
    po.id,
    po.reference_number,
    po.status,
    v.name as vendor_name,
    coalesce(sum(poi.quantity_ordered * poi.unit_cost), 0) as total_cost,
    string_agg(
        concat_ws(' | ', i.name) || ' (' || poi.quantity_ordered || ')',
        ', '
        order by i.name
    ) as description
from public.purchase_orders po
left join public.vendors v on po.vendor_id = v.id
left join public.purchase_order_items poi on po.id = poi.purchase_order_id
left join public.items i on poi.item_id = i.id
group by po.id, po.reference_number, po.status, v.name;

alter view public.purchase_order_summaries set (security_invoker = true);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

create policy "Approved users can view purchase orders" on public.purchase_orders
for select
using (public.is_approved_user());

create policy "Approved users can manage purchase orders" on public.purchase_orders
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

create policy "Approved users can view purchase order items" on public.purchase_order_items
for select
using (public.is_approved_user());

create policy "Approved users can manage purchase order items" on public.purchase_order_items
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;
