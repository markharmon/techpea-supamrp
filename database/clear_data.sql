-- Script to clear transactional data (Work Orders and Items)
-- Use with CAUTION!

TRUNCATE TABLE 
    public.production_logs,
    public.work_order_items,
    public.work_orders,
    public.bom,
    public.items
RESTART IDENTITY CASCADE;
