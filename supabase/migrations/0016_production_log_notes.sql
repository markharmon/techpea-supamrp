-- Add optional operator notes to production logs.
alter table public.work_logs
add column if not exists notes text;

create table if not exists public.material_batches (
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