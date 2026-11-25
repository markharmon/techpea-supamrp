-- Item batches: batch-level stock tracking with manufacture/expiry dates.
-- Adds batch_size to items and a new item_batches table.
-- Note: items.current_stock/reserved_stock remain authoritative for now;
-- migrating quantity tracking onto batches is a follow-up change.

alter table public.items
    add column if not exists batch_size numeric,
    add column if not exists batch_unit text;

create table if not exists public.item_batches (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.items(id) on delete cascade,
    manufacture_date date,
    expiry_date date,
    quantity numeric not null default 0 check (quantity >= 0),
    reserved numeric not null default 0 check (reserved >= 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint item_batches_reserved_not_exceed_quantity check (reserved <= quantity),
    constraint item_batches_expiry_after_manufacture check (
        expiry_date is null or manufacture_date is null or expiry_date >= manufacture_date
    )
);

create index if not exists idx_item_batches_item_id on public.item_batches(item_id);
create index if not exists idx_item_batches_expiry_date on public.item_batches(expiry_date);

drop trigger if exists on_set_updated_at_item_batches on public.item_batches;
create trigger on_set_updated_at_item_batches
before update on public.item_batches
for each row
execute function public.set_updated_at();

-- RLS
alter table public.item_batches enable row level security;

drop policy if exists "Approved users can view item batches" on public.item_batches;
create policy "Approved users can view item batches" on public.item_batches
for select
using (public.is_approved_user());

drop policy if exists "Approved users can manage item batches" on public.item_batches;
create policy "Approved users can manage item batches" on public.item_batches
for all
using (public.has_permission(array['admin', 'supervisor', 'staff']))
with check (public.has_permission(array['admin', 'supervisor', 'staff']));

-- Grants
grant select, insert, update, delete on public.item_batches to authenticated;
