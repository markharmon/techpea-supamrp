-- Add external/internal traceability codes to item batches.
alter table public.item_batches
    add column if not exists external_code text,
    add column if not exists internal_code text;
